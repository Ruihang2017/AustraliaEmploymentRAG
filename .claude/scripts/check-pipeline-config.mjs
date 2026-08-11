#!/usr/bin/env node
// check-pipeline-config.mjs — is the pipeline's own configuration on disk the one we
// think we are running?
//
// The three-agent pattern configures itself out of version-controlled files:
// `.claude/agents/*.md` (who each stage IS), `.claude/workflows/*.js` (the schedulers),
// `.claude/scripts/*.mjs` (deliver + publish + DAG), `.claude/hooks/*.mjs` (the
// main-session write guard) and `.claude/settings.json` (what any of them may run).
// The Builder checks out `ticket/<id>` and — at concurrency 1, where
// `start-all.js`/`run-milestone.js` set `isolate = concurrency > 1` — it does that in
// the MAIN working tree. So checking out a ticket branch whose base predates a change
// to `.claude/**` rolls that change back on disk, silently. Observed 2026-08-11: a fix
// round on `ticket/DATA-02` (base older than the commit that made the Builder delegate
// to Codex) reverted `.claude/agents/builder.md` to the Claude implementer, and the run
// answered a different question than the one asked. The older the branch's base, the
// further the live configuration rolls back, and nothing reported it.
//
// Two different exposures, measured on this harness 2026-08-11:
//   - agent definitions are read ONCE per CLI process. Two spawns 2.5 minutes apart in a
//     running session both got the pre-edit definition after `.claude/agents/*.md` changed
//     on disk; a freshly started `claude -p` process immediately saw a newly added agent.
//     => a stale checkout does not swap the agents of a run already in flight, but it
//        poisons the WHOLE lifetime of the next session started over that tree, and
//        restoring the files is not enough — that session has to be restarted.
//   - scripts and hooks are read from disk at every invocation, so those DO roll back
//     live, mid-run (e.g. the deliver step running an older `deliver-ticket.mjs`).
//
// This script only LOOKS. It never checks out, resets, merges, stashes or writes
// anything: a loud stop is the whole point, and silently repairing a tree mid-run would
// reintroduce the same class of surprise from the other direction.
//
// Usage:
//   node .claude/scripts/check-pipeline-config.mjs [--ref <ref>] [--default-branch main]
//        [--quiet]
//
// --ref            reference to compare against; default `origin/<default-branch>`,
//                  falling back to the local `<default-branch>` when there is no remote
//                  ref (never fetches — a check must not depend on the network).
// --default-branch default 'main'.
// --quiet          print only the JSON line.
//
// Output — always a final line:
//   CONFIG-CHECK-JSON: {"ok",<bool>,"ref","refSha","mainRoot","head","drifted":[...],
//                       "untracked":[...],"detail"}
// Exit: 0 = matches, 1 = drift found (loud on purpose), 2 = the check itself could not run.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback
}
const quiet = argv.includes('--quiet')
const defaultBranch = flag('--default-branch', 'main')
const refArg = flag('--ref', null)

// Paths under .claude/ that are ephemeral by design and must never count as drift.
// `tmp/` is the git-ignored scratch area the deliver step and reviewer use; `worktrees/`
// holds lane checkouts; `allow-main-writes` is the documented, git-ignored override switch.
const IGNORED = ['.claude/tmp/', '.claude/worktrees/', '.claude/allow-main-writes']
const ignored = (p) => IGNORED.some((i) => p === i || p.startsWith(i))

const emit = (obj, code) => {
  if (!quiet && obj.detail) console.log(obj.detail)
  console.log('CONFIG-CHECK-JSON: ' + JSON.stringify(obj))
  process.exit(code)
}

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

// Always inspect the MAIN working tree, whatever directory we were invoked from. A lane
// worktree has its own checkout, but the agent definitions the session is running came
// from the main tree, so that is the tree this question is about.
const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], process.cwd())
if (!common.ok) {
  emit({ ok: false, drifted: [], untracked: [], detail: 'not a git repository (or git unavailable): ' + common.err }, 2)
}
// --git-common-dir prints <main-working-tree>/.git even from inside a linked worktree.
const mainRoot = resolve(common.out.replace(/[\\/]+$/, ''), '..')
if (!existsSync(resolve(mainRoot, '.claude'))) {
  emit({ ok: false, mainRoot, drifted: [], untracked: [], detail: 'no .claude/ directory at the main working tree root ' + mainRoot }, 2)
}

const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], mainRoot).out || '(detached)'
const headSha = git(['rev-parse', '--short', 'HEAD'], mainRoot).out

// Resolve the reference. origin/<default> is the right yardstick: it is what every ticket
// branch is supposed to be cut from, and it is the copy a human would recognize as "current".
let ref = refArg
if (!ref) {
  ref = git(['rev-parse', '--verify', '--quiet', 'origin/' + defaultBranch], mainRoot).ok
    ? 'origin/' + defaultBranch
    : defaultBranch
}
const refSha = git(['rev-parse', '--short', ref], mainRoot)
if (!refSha.ok) {
  emit({ ok: false, mainRoot, head, ref, drifted: [], untracked: [], detail: 'cannot resolve reference ' + ref + ': ' + refSha.err }, 2)
}

// `git diff <ref> -- .claude` compares the reference against the WORKING TREE, so this
// catches both halves at once: a rolled-back checkout and an uncommitted hand-edit.
const diff = git(['diff', '--name-status', ref, '--', '.claude'], mainRoot)
if (!diff.ok) {
  emit({ ok: false, mainRoot, head, ref, refSha: refSha.out, drifted: [], untracked: [], detail: 'git diff failed: ' + diff.err }, 2)
}
const drifted = diff.out
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const parts = l.split(/\s+/)
    return { status: parts[0], path: parts[parts.length - 1].replace(/\\/g, '/') }
  })
  .filter((d) => !ignored(d.path))

const others = git(['ls-files', '--others', '--exclude-standard', '--', '.claude'], mainRoot)
const untracked = others.out
  .split('\n')
  .map((l) => l.trim().replace(/\\/g, '/'))
  .filter(Boolean)
  .filter((p) => !ignored(p))

const ok = drifted.length === 0 && untracked.length === 0
const lines = []
if (ok) {
  lines.push('pipeline config matches ' + ref + ' (' + refSha.out + '); HEAD is ' + head + ' @ ' + headSha)
} else {
  lines.push('PIPELINE CONFIG DRIFT — the .claude/ tree on disk is NOT ' + ref + ' (' + refSha.out + ').')
  lines.push('  main working tree: ' + mainRoot)
  lines.push('  HEAD:              ' + head + ' @ ' + headSha)
  for (const d of drifted) lines.push('  ' + d.status + '  ' + d.path)
  for (const u of untracked) lines.push('  ??  ' + u)
  lines.push('This is how a stale ticket branch silently swaps out the agents, scripts and hooks')
  lines.push('the run is made of. Do NOT "fix" it by merging ' + ref + ' into a ticket branch or by')
  lines.push('resetting anything — a human decides. If HEAD is a ticket branch, the pipeline left')
  lines.push('the main tree checked out on it; restore it with `git checkout ' + defaultBranch + '` and')
  lines.push('RESTART the session: agent definitions are loaded once per CLI process, so a session')
  lines.push('started over a stale tree keeps the stale agents for its whole life.')
}

emit(
  { ok, mainRoot, head, headSha, ref, refSha: refSha.out, drifted, untracked, detail: lines.join('\n') },
  ok ? 0 : 1
)
