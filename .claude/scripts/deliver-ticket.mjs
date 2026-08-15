#!/usr/bin/env node
// deliver-ticket.mjs — the ONLY sanctioned delivery path for the three-agent
// pattern (catalog issues #26, #50). Delivery used to be a generic LLM agent
// prompted to merge + close + verify; harness safety classifiers repeatedly
// blocked that agent even after a journaled CLEAR, stranding CLEAR-verdict
// tickets. Delivery is deterministic instead: the merge policy stays mechanically
// checkable and the only permission surface is this one command (which is why the
// `gh pr` / `glab mr` calls below live HERE and not on the agent's Bash surface —
// settings.json deliberately does NOT allow `gh pr`, issue #30).
//
// Delivery modes (#50, #56 — the pattern produced 0 PRs / 0 remote branches before #50):
//   pr     : push the branch, open a PR/MR carrying the plan + Closes #<n>, post the
//            Reviewer's CLEAR verdict as a PR/MR COMMENT (the durable review trail),
//            then merge THROUGH the forge (`gh pr merge` / `glab mr merge` — respects
//            branch protection; a required-but-unmet check fails the merge, which
//            escalates rather than force-landing), fast-forward the local default to
//            the merged remote, close + verify the issue, run the DoD test-cmd.
//   direct : the legacy local `--no-ff` merge + push (for repos with no remote or no
//            forge CLI). Kept intact so no-forge repos still deliver.
//   pushmr : GitLab only, for orgs whose token has the Issues API but a 403 MR API AND a
//            protected default branch (catalog issue #56) — where neither pr (needs MR API)
//            nor direct (needs to push protected main) works. Opens the MR over SSH via
//            `git push -o merge_request.*` (no MR API); the single-line description carries
//            Closes #N (git forbids newlines in push options), and the CLEAR verdict is
//            posted as an ISSUE comment via the working Issues API. Stops for a human web
//            merge; a resume run detects the landed merge and closes/verifies via Issues API.
//   auto   : pr when the MR/PR API is usable; else on glab, pushmr when the MR API is
//            403/denied; else direct. (default)
//
// --no-merge (pr mode): push + open PR/MR + post the verdict comment, then STOP without
// merging — how supervised mode hands the human an open, evidenced PR. (pushmr always
// stops for a human web merge, so --no-merge is implicit there.)
//
// Usage:
//   node .claude/scripts/deliver-ticket.mjs --id <ticket-id> --branch <branch>
//        [--default-branch main] [--issue <n>] [--platform gh|glab]
//        [--delivery pr|direct|pushmr|auto] [--no-merge] [--verdict-file <path>]
//        [--body-file <path>] [--test-cmd "<command>"]
//        [--checks-timeout <seconds>] [--checks-interval <seconds>]
//
// PR/MR body (issue #58): a pre-composed --body-file is REQUIRED to open a PR/MR, and is used
// verbatim. There is no repo-template skeleton and no hardcoded fallback: an unfilled
// .github/PULL_REQUEST_TEMPLATE.md cannot satisfy the PRD §45.4 contract check by construction
// (.github/workflows/checks/pr-contract.mjs wants a requirement ID and a `## Constraint check`
// heading, and its own header forbids editing the template to make it pass), so opening a PR
// with one manufactures a red required context. Composing the body is the deliver AGENT's job
// (CLAUDE.md, issue #58); with no --body-file this script opens no PR and reports NOT delivered.
//
// Required-check gate (FND-20 / DEV-004, phase-2 decision D-CI3): before merging on the `pr`
// path this script resolves the pull request's REQUIRED check contexts from the forge and waits,
// bounded, for each to CONCLUDE — the merge is attempted seconds after the push, when the
// required contexts are still pending, so a plain refusal would deadlock delivery. It merges only
// when every counted context concluded successfully. A failing context, a still-pending context
// at the timeout, an unreadable rollup, and an empty counted set are all STOPS: no merge is
// attempted. Defaults --checks-timeout 1200 (20 min) and --checks-interval 20 (seconds); the
// numbers are open question Q-CI-B (docs/prd/breakdown-plan-02-ci-repair.md §7), owner Founder.
// There is deliberately no --admin, no --auto, no force and no approval bypass.
//
// Last line of stdout is machine-readable for run-milestone:
//   DELIVER-SUMMARY-JSON: {"id","branch","deliveryMode","merged","issueClosed",
//     "dodPassed","awaitingMerge","prUrl","checks":{...},"notes"}
// Exit codes: 0 = delivered, or a documented awaiting-merge stop (--no-merge, pushmr's
//                 human-web-merge stop);
//             1 = bad invocation or unexpected internal error;
//             2 = summary printed, delivery did NOT complete.
// The DELIVER-SUMMARY-JSON line is printed BEFORE any exit other than an argv-validation exit,
// so a caller that parses the line always gets it.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const has = (name) => argv.includes('--' + name)
const opt = (name) => {
  const i = argv.indexOf('--' + name)
  if (i === -1) return ''
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : ''
}

const ID = opt('id')
const BRANCH = opt('branch')
const DEFAULT_BRANCH = opt('default-branch') || 'main'
const ISSUE_ARG = opt('issue')
const PLATFORM = opt('platform') || 'gh'
const DELIVERY = opt('delivery') || 'auto'
const NO_MERGE = has('no-merge')
const VERDICT_FILE = opt('verdict-file')
const BODY_FILE = opt('body-file') // pre-composed PR/MR body (agent-filled from the repo template)
const TEST_CMD = opt('test-cmd')

// Numeric option with a default. A malformed value is a BAD INVOCATION (exit 1) — the one class
// of failure that exits before a summary exists, because nothing has been attempted yet.
const numOpt = (name, dflt) => {
  const raw = opt(name)
  if (!raw) return dflt
  const v = Number(raw)
  if (!Number.isFinite(v) || v < 0) {
    console.error(`invalid --${name} (expected a number of seconds >= 0): ${raw}`)
    process.exit(1)
  }
  return v
}
// D-CI3 defaults; the numbers are Q-CI-B (owner: Founder). --checks-timeout 0 means
// "evaluate the gate exactly once, do not wait" — it never means "skip the gate".
const CHECKS_TIMEOUT_S = numOpt('checks-timeout', 1200)
const CHECKS_INTERVAL_S = Math.max(1, numOpt('checks-interval', 20))

if (!ID || !BRANCH) {
  console.error('usage: node deliver-ticket.mjs --id <ticket-id> --branch <branch> [--default-branch main] [--issue <n>] [--platform gh|glab] [--delivery pr|direct|pushmr|auto] [--no-merge] [--verdict-file <path>] [--body-file <path>] [--test-cmd "<command>"] [--checks-timeout <seconds>] [--checks-interval <seconds>]')
  process.exit(1)
}
if (!/^[A-Za-z0-9._-]+$/.test(ID)) {
  console.error(`invalid --id (allowed: letters, digits, . _ -): ${ID}`)
  process.exit(1)
}
if (!/^[A-Za-z0-9/._-]+$/.test(BRANCH) || !/^[A-Za-z0-9/._-]+$/.test(DEFAULT_BRANCH)) {
  console.error('invalid --branch / --default-branch (allowed: letters, digits, / . _ -)')
  process.exit(1)
}
if (BRANCH === DEFAULT_BRANCH) {
  console.error(`--branch must differ from --default-branch (got ${BRANCH} for both) — nothing to deliver`)
  process.exit(1)
}
if (PLATFORM !== 'gh' && PLATFORM !== 'glab') {
  console.error(`unknown platform: ${PLATFORM} (expected gh or glab)`)
  process.exit(1)
}
if (!['pr', 'direct', 'pushmr', 'auto'].includes(DELIVERY)) {
  console.error(`unknown --delivery: ${DELIVERY} (expected pr, direct, pushmr, or auto)`)
  process.exit(1)
}
if (VERDICT_FILE && !existsSync(VERDICT_FILE)) {
  console.error(`--verdict-file not found: ${VERDICT_FILE}`)
  process.exit(1)
}

const run = (bin, args, opts = {}) => execFileSync(bin, args, { encoding: 'utf8', ...opts })
const git = (args, opts = {}) => run('git', args, opts)
const errText = (e) => String((e && (e.stderr || e.stdout || e.message)) || e).trim()
const firstLine = (s) => String(s).trim().split('\n')[0]
const lastLine = (s) => String(s).trim().split('\n').filter(Boolean).pop() || ''
const tryGit = (args) => {
  try { return { ok: true, out: git(args, { stdio: ['ignore', 'pipe', 'pipe'] }) } } catch (e) { return { ok: false, out: errText(e) } }
}

// GH_BIN / GLAB_BIN env overrides (same mechanism as publish-tickets.mjs) for
// non-PATH binaries and test doubles, e.g. GH_BIN="node tools/fake-gh.mjs".
const cli = (args, opts = {}) => {
  const raw = PLATFORM === 'gh' ? process.env.GH_BIN || 'gh' : process.env.GLAB_BIN || 'glab'
  const parts = raw.split(' ')
  return run(parts[0], [...parts.slice(1), ...args], opts)
}
const tryCli = (args, opts = {}) => {
  try { return { ok: true, out: cli(args, opts) } } catch (e) { return { ok: false, out: errText(e) } }
}

const checks = {
  planExists: false, alreadyMerged: false, merged: false,
  pushRequired: false, pushed: false, branchPushed: false,
  prCreated: false, prExists: false, verdictPosted: false,
  issueClosed: false, testsPassed: null,
  // FND-20: the required-check gate's own record. null = the gate was never reached.
  requiredChecksGreen: null,   // true only when every counted context concluded successfully
  requiredCheckRule: '',       // 'protection' | 'rollup-fallback' | 'skipped-already-merged' | 'skipped-glab'
  requiredCheckContexts: [],   // the counted context names, as the forge reported them
}
let prUrl = ''
let deliveryMode = 'direct'
let awaitingMerge = false
const notes = []
const note = (line) => { notes.push(line); console.log('  (note) ' + line) }

// Definition-of-Done inputs. Runs at most once, from finish(), so that EVERY stop — not only the
// happy path — reports an honest planExists/testsPassed. FND-20 deliverable 4: a run with no
// --test-cmd tested nothing, so it cannot claim the DoD.
let dodEvaluated = false
const evaluateDod = () => {
  if (dodEvaluated) return
  dodEvaluated = true
  checks.planExists = existsSync(join('docs', 'plans', `${ID}.md`))
  if (!checks.planExists) note(`plan file missing: docs/plans/${ID}.md`)
  if (!TEST_CMD) {
    note('no --test-cmd supplied — the Definition of Done requires a test run, so dodPassed is false (declare the repository test command in CLAUDE.md and pass it as --test-cmd)')
    return
  }
  const t = spawnSync(TEST_CMD, { shell: true, encoding: 'utf8' })
  checks.testsPassed = t.status === 0
  if (!checks.testsPassed) note(`--test-cmd failed (exit ${t.status}): ${String(t.stdout || t.stderr || '').trim().split('\n').slice(-3).join(' | ')}`)
}

// FND-20 deliverable 3: the exit code is DERIVED, not passed in. Call finish() with no argument at
// every non-error stop; a stop that neither delivered nor is a deliberate awaitingMerge stop exits
// 2, so an unlanded merge is a hard failure rather than a note() execution continues past. Do not
// "restore" finish(0) at these call sites. finish(1) stays reserved for an internal error, and
// skips the DoD evaluation because an internal error must not start a test run.
const finish = (code) => {
  if (code !== 1) evaluateDod()
  const dodPassed = !awaitingMerge &&
    checks.planExists &&
    checks.merged &&
    checks.issueClosed &&
    (!checks.pushRequired || checks.pushed) &&
    checks.testsPassed === true
  const summary = {
    id: ID, branch: BRANCH, deliveryMode,
    merged: checks.merged, issueClosed: checks.issueClosed, dodPassed,
    awaitingMerge, prUrl, checks, notes: notes.join('; '),
  }
  console.log('DELIVER-SUMMARY-JSON: ' + JSON.stringify(summary))
  process.exit(code !== undefined ? code : ((awaitingMerge || dodPassed) ? 0 : 2))
}

// close the tracker issue and verify the transition — never assume auto-close.
// ONLY after the work actually landed: a closed issue is what resume filtering
// treats as "delivered by an earlier run", so closing on a failed merge would
// silently drop the ticket from every future run.
const closeIssue = () => {
  let issueNum = ISSUE_ARG ? Number(ISSUE_ARG) : null
  if (issueNum !== null && (!Number.isInteger(issueNum) || issueNum < 1)) {
    note(`invalid --issue value: ${ISSUE_ARG}`)
    issueNum = null
  }
  if (!issueNum) {
    try {
      if (PLATFORM === 'gh') {
        const list = JSON.parse(cli(['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title']))
        const hit = list.find((i) => String(i.title).startsWith(`[${ID}]`))
        if (hit) issueNum = hit.number
      } else {
        const text = cli(['issue', 'list', '--all'])
        const line = text.split('\n').find((l) => l.includes(`[${ID}]`))
        const m = line && line.match(/#(\d+)\b/)
        if (m) issueNum = Number(m[1])
      }
    } catch (e) {
      note(`issue lookup failed: ${firstLine(errText(e))}`)
    }
  }
  if (!issueNum) { note(`no tracker issue found for [${ID}]`); return }
  try {
    cli(['issue', 'close', String(issueNum), ...(PLATFORM === 'gh' ? ['--comment', `Delivered: ${BRANCH} merged to ${DEFAULT_BRANCH} (run-milestone, CLEAR verdict).`] : [])])
  } catch (e) {
    note(`issue close command failed: ${firstLine(errText(e))}`) // verification below still decides
  }
  try {
    if (PLATFORM === 'gh') {
      const view = JSON.parse(cli(['issue', 'view', String(issueNum), '--json', 'state']))
      checks.issueClosed = String(view.state).toUpperCase() === 'CLOSED'
    } else {
      checks.issueClosed = cli(['issue', 'view', String(issueNum)]).split('\n').slice(0, 5).some((l) => /\bclosed\b/i.test(l))
    }
    console.log((checks.issueClosed ? '+ closed  ' : '  (note) NOT closed: ') + `issue #${issueNum}`)
    if (!checks.issueClosed) notes.push(`issue #${issueNum} still open after close attempt`)
  } catch (e) {
    note(`issue state verification failed: ${firstLine(errText(e))}`)
  }
}

// the PR/MR title and structured body — shared by the pr (API) and pushmr paths.
// withVerdict inlines the CLEAR verdict into the body; the pr path posts it as a
// comment instead, but pushmr has no MR-comment API (issue #56) so it goes in the body.
const prTitle = () => {
  const subject = (tryGit(['log', '-1', '--format=%s', BRANCH]).out || BRANCH).trim().slice(0, 100)
  return `[${ID}] ${subject}`.slice(0, 120)
}
// PR/MR body: the pre-composed --body-file (the deliver AGENT fills the repo template's semantic
// sections — Type/Changes/Constraint-check/Evidence — from the ticket, diff, verdict and this
// repo's CLAUDE.md; issue #58) is the ONLY source. Returns null when there is none.
//
// FND-20 deliverable 5, recorded so it is not "simplified" back later: the previous fallbacks —
// the repository template as a skeleton, then a hardcoded body — are deleted, not disabled. An
// unfilled .github/PULL_REQUEST_TEMPLATE.md carries neither a requirement ID nor a
// `## Constraint check` heading, so it is GUARANTEED to fail the PRD §45.4 contract context; a PR
// opened with one manufactures a red required check, which combined with a merge that never read
// CI is exactly how 32 pull requests merged red. The template is frozen and unallocated (Q-F6) and
// pr-contract.mjs's own header forbids editing it to make the check pass, so the fix can only be
// that the CALLER composes a body — never that this script invents one.
const resolvePrBody = () => {
  if (BODY_FILE && existsSync(BODY_FILE)) return readFileSync(BODY_FILE, 'utf8')
  return null
}

// Divergence guard — run immediately BEFORE any push of the TICKET branch.
//
// Incident (concurrency-6 run, terminated mid-flight): some ticket branches were already
// on origin when the run died. A later run rebuilt ticket FND-06 from scratch on the same
// branch name, producing a SECOND independent implementation. Neither head was an ancestor
// of the other. Nothing noticed until push time, where git emitted its generic
// "non-fast-forward" hint and delivery aborted on an opaque message.
//
// Two independent builds of one ticket cannot be merged or rebased — they touch the same
// files and the same functions with different implementations, and any hand-merged result
// would be code no reviewer ever judged. So: detect it here and STOP with a message that
// names both shas. Never force-push, never rebase, never delete — the choice of which
// build survives is a human judgement call, and this script does not make it.
const shortSha = (ref) => {
  const r = tryGit(['rev-parse', '--short', ref])
  return r.ok ? r.out.trim() : '(unknown)'
}
// true = safe to push. Calls finish() (never returns) when the branch has diverged.
const assertBranchNotDiverged = () => {
  // A branch that does not exist on origin is the normal first-delivery case, so a failed
  // fetch is NOT an error here — it just means there is nothing remote to compare against.
  const fetched = tryGit(['fetch', 'origin', BRANCH])
  let remoteRef = ''
  if (fetched.ok && tryGit(['rev-parse', '--verify', '--quiet', 'FETCH_HEAD']).ok) remoteRef = 'FETCH_HEAD'
  else if (tryGit(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`]).ok) remoteRef = `refs/remotes/origin/${BRANCH}`
  if (!remoteRef) return true // nothing on origin for this branch — push is a plain create

  if (tryGit(['merge-base', '--is-ancestor', remoteRef, BRANCH]).ok) return true // fast-forward

  const remoteSha = shortSha(remoteRef)
  const localSha = shortSha(BRANCH)
  note(`DIVERGED: origin/${BRANCH} (${remoteSha}) is NOT an ancestor of local ${BRANCH} (${localSha}) — refusing to push`)
  note(`two independent builds of ticket ${ID} exist on branch ${BRANCH}: remote ${remoteSha} (pushed by an earlier run) and local ${localSha} (this run)`)
  note('they cannot be merged or rebased — same files, same functions, different implementations; any combined result would be code no reviewer judged')
  note(`a HUMAN must choose which build to keep, then delete/replace the other: inspect with \`git log --oneline ${remoteSha}..${localSha}\` and \`git log --oneline ${localSha}..${remoteSha}\`, and \`git diff ${remoteSha} ${localSha}\``)
  note(`nothing was pushed, forced, rebased or deleted; ticket ${ID} is NOT delivered`)
  console.log(`= diverged ${BRANCH}: remote ${remoteSha} vs local ${localSha} — human decision required`)
  finish()
  return false // unreachable (finish exits) — kept so the call site reads as a guard
}

// find an existing PR/MR for the branch; returns { number, url } or null
// OPEN-FIRST is load-bearing, not a preference. `--state all` is deliberate (a run that
// paused after opening a PR must find THAT PR again instead of opening a duplicate, and a
// MERGED PR must still be returned so the alreadyMerged path below stays correct) — but a
// plain "first of --state all" hit delivery three times in one session: delete a ticket
// branch on the remote (cleanup, or an interrupted run) and GitHub auto-closes its PR;
// recreate the branch with different history and that CLOSED PR now points at commits that
// no longer exist. It cannot be merged and `gh pr reopen` refuses it, so returning it set
// checks.prExists, skipped `pr create`, and every future run died on
// "GraphQL: Pull Request is not mergeable" — the ticket was blocked forever until a human
// opened a replacement PR by hand. So: OPEN wins; else MERGED (the work landed); a
// CLOSED-only branch is reported and treated as "no PR", letting `pr create` open a fresh one.
const findPr = () => {
  try {
    if (PLATFORM === 'gh') {
      const arr = JSON.parse(cli(['pr', 'list', '--head', BRANCH, '--state', 'all', '--json', 'number,url,state']))
      if (!Array.isArray(arr) || !arr.length) return null
      const stateOf = (p) => String(p && p.state || '').toUpperCase()
      const usable = arr.find((p) => stateOf(p) === 'OPEN') || arr.find((p) => stateOf(p) === 'MERGED')
      if (usable) return { number: usable.number, url: usable.url }
      note(`existing PR(s) for ${BRANCH} are closed and cannot be merged (${arr.map((p) => '#' + p.number).join(', ')}) — opening a new PR`)
      return null
    }
    const text = cli(['mr', 'list', '--source-branch', BRANCH])
    const m = text.match(/!(\d+)/)
    return m ? { number: Number(m[1]), url: '' } : null
  } catch (e) {
    note(`PR/MR lookup failed: ${firstLine(errText(e))}`)
    return null
  }
}

// ---- the required-check gate (FND-20 / DEV-004, decision D-CI3) ----
//
// Why a WAIT and not a refusal: DEV-004 says the script must not merge a PR whose required checks
// are not green. Implemented as a plain refusal that deadlocks delivery — the merge is attempted
// seconds after `git push`, when every required context is still *pending*, so "not green" is the
// normal state at merge time and nothing would ever land. D-CI3 resolves it: wait, bounded, for
// each counted context to CONCLUDE, then merge only if all concluded successfully. A timeout is a
// hard failure, never a merge. Lowering the timeout until the gate is vacuous is the same defect
// as removing it.
//
// Fail CLOSED everywhere: unreadable rollup, unparsable JSON, zero counted contexts and a required
// context missing from the rollup all resolve to a STOP. A gate that finds nothing to check fails;
// it never passes.

// Sleep without a dependency and without going async — this script is synchronous top to bottom.
const sleepMs = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }

// The branch-protection required-context list for the TARGET branch. null = UNREADABLE (no
// permission, or no protection configured) -> the documented rollup fallback, never "merge anyway".
// An empty-but-readable list is NOT null: it means zero counted contexts, which is a stop.
// `gh api` resolves the {owner}/{repo} placeholders from the checkout, so no extra lookup call.
const requiredContextNames = () => {
  const r = tryCli(['api', `repos/{owner}/{repo}/branches/${DEFAULT_BRANCH}/protection/required_status_checks`])
  if (!r.ok) return null
  try {
    const j = JSON.parse(r.out)
    const names = [...(j.contexts || []), ...((j.checks || []).map((c) => c && c.context))]
    return [...new Set(names.filter(Boolean).map(String))]
  } catch { return null }
}

// The PR's check rollup, normalised to { name, concluded, ok }. Deliberately reads the PER-CONTEXT
// status/conclusion/state only — never a mergeStateStatus / statusCheckRollupState shortcut, which
// would let a convenience field speak for a context that is in fact failing.
const rollupEntries = (n) => {
  const raw = JSON.parse(cli(['pr', 'view', String(n), '--json', 'statusCheckRollup']))
  return (raw.statusCheckRollup || []).map((e) => {
    const name = String((e && (e.name || e.context)) || '')
    if (e && (e.status !== undefined || e.conclusion !== undefined)) { // CheckRun
      const concluded = String(e.status || '').toUpperCase() === 'COMPLETED'
      const c = String(e.conclusion || '').toUpperCase()
      // SKIPPED/NEUTRAL count as passing — GitHub's own required-check semantics; treating a
      // conditionally-skipped required job as a failure would deadlock delivery.
      return { name, concluded, ok: ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(c) }
    }
    const s = String((e && e.state) || '').toUpperCase() // StatusContext
    return { name, concluded: s !== 'PENDING' && s !== 'EXPECTED' && s !== '', ok: s === 'SUCCESS' }
  })
}

const awaitRequiredChecks = (n) => {
  const required = requiredContextNames()
  const rule = required === null ? 'rollup-fallback' : 'protection'
  if (required === null) note('branch-protection required-context list unreadable — counting EVERY context in the PR rollup instead (this is the documented fallback, not a bypass)')
  const deadline = Date.now() + CHECKS_TIMEOUT_S * 1000
  for (;;) {
    // Evaluated BEFORE the first sleep, so --checks-timeout 0 evaluates exactly once.
    let entries
    try { entries = rollupEntries(n) } catch (e) {
      return { rule, green: false, counted: [], reason: `check rollup unreadable: ${firstLine(errText(e))} — a delivery script that cannot see the gate must not merge` }
    }
    const byName = new Map(entries.map((x) => [x.name, x]))
    // A required context ABSENT from the rollup counts as PENDING, never as absent: that is the
    // "queued but not yet reported" case, and dropping it would make the gate vacuous seconds
    // after the push — precisely the window this gate exists to cover.
    const counted = required === null ? entries : required.map((name) => byName.get(name) || { name, concluded: false, ok: false })
    const names = counted.map((x) => x.name)
    if (!counted.length) return { rule, green: false, counted: [], reason: 'no check context to gate on — a gate that finds nothing to check fails, it never passes' }
    const failing = counted.filter((x) => x.concluded && !x.ok).map((x) => x.name)
    if (failing.length) return { rule, green: false, counted: names, reason: `required check(s) did not pass: ${failing.join(', ')}` }
    const pending = counted.filter((x) => !x.concluded).map((x) => x.name)
    if (!pending.length) return { rule, green: true, counted: names, reason: '' }
    if (Date.now() >= deadline) return { rule, green: false, counted: names, reason: `timed out after ${CHECKS_TIMEOUT_S}s waiting for required check(s) to conclude: ${pending.join(', ')}` }
    console.log(`  (wait) required checks pending: ${pending.join(', ')}`)
    sleepMs(CHECKS_INTERVAL_S * 1000)
  }
}

try {
  // 0. operate from the repo root regardless of cwd
  process.chdir(git(['rev-parse', '--show-toplevel']).trim())

  // 1. clean tree — merging over uncommitted work is never sanctioned. `.claude/tmp/`
  // is ignored: run-milestone stages the Reviewer's verdict there for --verdict-file,
  // and that ephemeral scratch must not read as "dirty" and block delivery.
  // `.claude/tmp/` (staged verdict/body) and `docs/plans/` (the Architect's HOW plan —
  // ephemeral, and the DoD needs it to EXIST on disk, not be committed) are ignored so
  // untracked scratch never reads as "dirty" and blocks delivery (issues #50, #58).
  // `-uall` is load-bearing, not a detail: porcelain defaults to `-unormal`, which
  // COLLAPSES an entirely-untracked directory to a single entry. In a repo with nothing
  // tracked under docs/, the Architect's plan makes git print `?? docs/` — which this
  // path-anchored allowlist cannot match, so delivery refused every ticket as "dirty".
  // Observed on the catalog's own Level-1 rehearsal, 2026-07-27 (issue #75).
  const dirty = git(['status', '--porcelain', '-uall']).split('\n').filter((l) => l.trim() && !/\.claude\/tmp\/|docs\/plans\//.test(l))
  if (dirty.length) { note('working tree not clean — refusing to merge'); finish() }

  // 2. refs must exist locally
  for (const ref of [BRANCH, DEFAULT_BRANCH]) {
    if (!tryGit(['rev-parse', '--verify', '--quiet', ref]).ok) { note(`ref not found: ${ref}`); finish() }
  }

  // 3. resolve delivery mode
  checks.pushRequired = tryGit(['remote', 'get-url', 'origin']).ok
  const cliAuthed = tryCli(['auth', 'status'], { stdio: ['ignore', 'ignore', 'ignore'] }).ok
  // Cheap MR/PR-API probe: a token can have a working Issues API but a 403 MR API
  // (org policy — catalog issue #56). On glab that routes delivery to push-option MR.
  const mrApiOk = () => (PLATFORM === 'gh'
    ? tryCli(['pr', 'list', '--limit', '1', '--json', 'number'], { stdio: ['ignore', 'pipe', 'ignore'] }).ok
    : tryCli(['mr', 'list', '--per-page', '1'], { stdio: ['ignore', 'pipe', 'ignore'] }).ok)
  if (DELIVERY === 'direct') deliveryMode = 'direct'
  else if (DELIVERY === 'pushmr') {
    if (PLATFORM !== 'glab') { note('--delivery pushmr is GitLab-only (a GitHub push cannot open a PR); use pr or direct'); finish() }
    if (!checks.pushRequired) { note('--delivery pushmr requires an origin remote'); finish() }
    deliveryMode = 'pushmr'
  } else if (DELIVERY === 'pr') {
    if (!checks.pushRequired || !cliAuthed) { note(`--delivery pr requires an origin remote and an authenticated ${PLATFORM}; falling back is not allowed under an explicit flag`); finish() }
    deliveryMode = 'pr'
  } else if (!checks.pushRequired || !cliAuthed) deliveryMode = 'direct'
  else if (mrApiOk()) deliveryMode = 'pr'
  else if (PLATFORM === 'glab') { deliveryMode = 'pushmr'; note('MR API unavailable (403/denied) — using GitLab push-option MR (issue #56)') }
  else deliveryMode = 'direct' // GitHub with no PR API: falls back; a protected default branch would then block the push (note it)
  console.log(`delivery mode: ${deliveryMode}`)

  // supervised (--no-merge) with no forge: there is no PR to open — leave the local
  // branch for the human to merge, exactly as pre-PR-mode supervised delivery did.
  if (NO_MERGE && deliveryMode === 'direct') {
    awaitingMerge = true
    note('supervised (--no-merge) with no forge: leaving the local branch for the human to merge')
    finish()
  }

  if (deliveryMode === 'direct') {
    // ---- direct (legacy, no-forge) path ----
    git(['checkout', DEFAULT_BRANCH], { stdio: ['ignore', 'pipe', 'pipe'] })
    if (tryGit(['merge-base', '--is-ancestor', BRANCH, 'HEAD']).ok) {
      checks.alreadyMerged = true; checks.merged = true
      console.log(`= merged  ${BRANCH} is already contained in ${DEFAULT_BRANCH}`)
    } else {
      const m = tryGit(['merge', '--no-ff', '--no-edit', '-m', `merge: [${ID}] ${BRANCH} -> ${DEFAULT_BRANCH} (pipeline CLEAR)`, BRANCH])
      if (m.ok) { checks.merged = true; console.log(`+ merged  ${BRANCH} -> ${DEFAULT_BRANCH} (--no-ff)`) }
      else { tryGit(['merge', '--abort']); note(`merge failed (aborted, tree left clean): ${firstLine(m.out)}`) }
    }
    if (checks.merged && checks.pushRequired) {
      const p = tryGit(['push', 'origin', DEFAULT_BRANCH])
      if (p.ok) { checks.pushed = true; console.log(`+ pushed  ${DEFAULT_BRANCH} -> origin`) }
      else note(`push failed: ${lastLine(p.out)}`)
    }
  } else if (deliveryMode === 'pushmr') {
    // ---- GitLab push-option MR path (no MR API; issue #56) ----
    // Resume: a prior run opened the MR and a human merged it on the web -> the branch is
    // now on origin/<base>. Detect that and fall through to close + DoD (Issues-API only).
    tryGit(['fetch', 'origin', DEFAULT_BRANCH])
    if (tryGit(['merge-base', '--is-ancestor', BRANCH, `origin/${DEFAULT_BRANCH}`]).ok) {
      checks.alreadyMerged = true; checks.merged = true; checks.pushed = true; checks.branchPushed = true
      console.log(`= merged  ${BRANCH} already on origin/${DEFAULT_BRANCH} (MR merged on the web)`)
      git(['checkout', DEFAULT_BRANCH], { stdio: ['ignore', 'pipe', 'pipe'] })
      const ff = tryGit(['merge', '--ff-only', `origin/${DEFAULT_BRANCH}`])
      if (!ff.ok) note(`local fast-forward failed: ${firstLine(ff.out)}`)
    } else {
      // open/update the MR over SSH via push options — no MR API. git forbids newlines in
      // a push-option value, so the description is a single line carrying Closes #N (issue
      // auto-closes on merge) + pointers; the full CLEAR verdict is posted as an ISSUE
      // comment via the WORKING Issues API. Re-running on a branch that already has an open
      // MR returns the existing MR URL (no duplicate). spawnSync so GitLab's "remote:"
      // stderr lines (the MR URL) are captured even on a successful push.
      const closes = ISSUE_ARG && Number(ISSUE_ARG) > 0 ? `Closes #${Number(ISSUE_ARG)}. ` : ''
      const desc = `${closes}Delivered by the three-agent pipeline (ticket ${ID}); plan docs/plans/${ID}.md; Reviewer verdict CLEAR — posted as a comment on the issue.`
      // same divergence guard as the pr path — this push also publishes the ticket branch
      assertBranchNotDiverged()
      const pushArgs = ['push', '-o', 'merge_request.create', '-o', `merge_request.target=${DEFAULT_BRANCH}`,
        '-o', `merge_request.title=${prTitle()}`, '-o', `merge_request.description=${desc}`, '-u', 'origin', BRANCH]
      const res = spawnSync('git', pushArgs, { encoding: 'utf8' })
      const out = (res.stdout || '') + '\n' + (res.stderr || '')
      if (res.status !== 0 && !/merge_requests\//.test(out)) { note(`push-option MR failed: ${lastLine(out)}`); finish() }
      checks.branchPushed = true
      const m = out.match(/https?:\/\/\S*\/-\/merge_requests\/\d+/) || out.match(/merge_requests\/(\d+)/)
      if (m) { prUrl = m[0].startsWith('http') ? m[0] : ('/-/merge_requests/' + m[1]); checks.prCreated = true; console.log(`+ mr      ${prUrl}`) }
      else { checks.prCreated = true; note('MR opened via push option, but no MR URL appeared in the remote output') }
      // the full evidence goes as an ISSUE comment via the Issues API (works even when the
      // MR API is 403). The push-option MR description is single-line, so the structured body
      // (agent-filled --body-file) can't live there — it lives on the issue. Prefer the full
      // body; fall back to the verdict text.
      const vnum = ISSUE_ARG && Number(ISSUE_ARG) > 0 ? Number(ISSUE_ARG) : null
      const commentSrc = BODY_FILE && existsSync(BODY_FILE) ? BODY_FILE : VERDICT_FILE
      if (commentSrc && vnum) {
        const vr = tryCli(['issue', 'note', String(vnum), '--message', readFileSync(commentSrc, 'utf8')])
        if (vr.ok) { checks.verdictPosted = true; console.log(`+ comment delivery evidence posted to issue #${vnum}`) }
        else note(`issue-comment failed: ${firstLine(vr.out)}`)
      } else if (commentSrc) note('evidence not posted — no --issue number to comment on')
      awaitingMerge = true
      console.log('= awaiting human merge on the web — no MR API to merge programmatically (issue #56)')
      finish()
    }
  } else {
    // ---- pr path ----
    // 3a. push the ticket branch so the forge has it (AC2: branch exists on remote).
    // Divergence guard first: a remote head that is not contained in the local head means a
    // previous run already built this ticket — stop with a named-sha message instead of
    // letting git's opaque non-fast-forward hint surface at push time.
    assertBranchNotDiverged()
    const pb = tryGit(['push', '-u', 'origin', BRANCH])
    if (pb.ok) { checks.branchPushed = true; console.log(`+ pushed  ${BRANCH} -> origin`) }
    else { note(`branch push failed: ${lastLine(pb.out)} — cannot open a PR without it`); finish() }

    // 3b. find or create the PR/MR
    let pr = findPr()
    if (pr) { checks.prExists = true; prUrl = pr.url; console.log(`= pr      exists for ${BRANCH} (#${pr.number})`) }
    else {
      const title = prTitle()
      const body = resolvePrBody() // the agent-composed --body-file, or null
      // FND-20 deliverable 5: no body, no PR. Checked BEFORE mkdtempSync/`pr create`, so nothing
      // is created and no temp dir leaks. The branch has already been pushed at this point; that
      // is intended and harmless — a pushed branch with no PR is inert.
      if (body === null) {
        note('no --body-file supplied — refusing to open a PR/MR with an unfilled body')
        note('the deliver agent composes the body from the repository template (CLAUDE.md, issue #58); .github/PULL_REQUEST_TEMPLATE.md is frozen and unfilled, and an unfilled body cannot satisfy the PRD §45.4 contract check')
        console.log(`= blocked ${BRANCH}: no --body-file — no PR was opened`)
        finish()
      }
      const tmp = mkdtempSync(join(tmpdir(), 'deliver-'))
      const bodyFile = join(tmp, 'body.md')
      writeFileSync(bodyFile, body)
      try {
        let out
        if (PLATFORM === 'gh') out = cli(['pr', 'create', '--base', DEFAULT_BRANCH, '--head', BRANCH, '--title', title, '--body-file', bodyFile])
        else out = cli(['mr', 'create', '--source-branch', BRANCH, '--target-branch', DEFAULT_BRANCH, '--title', title, '--description', body, '--yes'])
        prUrl = lastLine(out)
        const m = prUrl.match(/[#!/](\d+)\s*$/)
        pr = { number: m ? Number(m[1]) : null, url: prUrl }
        checks.prCreated = true; checks.prExists = true
        console.log(`+ pr      created: ${prUrl}`)
      } catch (e) {
        note(`PR/MR create failed: ${firstLine(errText(e))}`); finish()
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }

    // 3c. post the Reviewer's CLEAR verdict as a comment (AC1 — the durable review trail).
    // Only on a freshly-created PR, so re-runs never duplicate the comment.
    if (checks.prCreated && VERDICT_FILE && pr && pr.number) {
      const vr = PLATFORM === 'gh'
        ? tryCli(['pr', 'comment', String(pr.number), '--body-file', VERDICT_FILE])
        : tryCli(['mr', 'note', String(pr.number), '--message', readFileSync(VERDICT_FILE, 'utf8')])
      if (vr.ok) { checks.verdictPosted = true; console.log(`+ comment CLEAR verdict posted to #${pr.number}`) }
      else note(`verdict comment failed: ${firstLine(vr.out)}`)
    } else if (checks.prCreated && !VERDICT_FILE) {
      note('no --verdict-file supplied — PR opened without the verdict comment')
    }

    // 3d. supervised: stop here with an open, evidenced PR for the human to merge
    if (NO_MERGE) {
      awaitingMerge = true
      console.log(`= awaiting human merge: ${prUrl || '(PR open)'}`)
      finish()
    }

    // 3e. merge THROUGH the forge, then fast-forward the local default to it.
    tryGit(['fetch', 'origin', DEFAULT_BRANCH])
    if (tryGit(['merge-base', '--is-ancestor', BRANCH, `origin/${DEFAULT_BRANCH}`]).ok) {
      checks.alreadyMerged = true
      // The gate is skipped here and ONLY here: the work is already on the default branch, so
      // there is nothing left to gate. Never widen this skip.
      checks.requiredCheckRule = 'skipped-already-merged'
      console.log(`= merged  ${BRANCH} already on origin/${DEFAULT_BRANCH}`)
    } else if (pr && pr.number) {
      // FND-20 / D-CI3: consult the gate BEFORE the merge call. No --admin, no --auto, no force,
      // no approval bypass — `gh pr merge` keeps its exact argument list.
      if (PLATFORM === 'gh') {
        const gate = awaitRequiredChecks(pr.number)
        checks.requiredCheckRule = gate.rule
        checks.requiredCheckContexts = gate.counted
        checks.requiredChecksGreen = gate.green
        if (!gate.green) {
          note(`required-check gate refused the merge (rule: ${gate.rule}): ${gate.reason}`)
          note(`no merge was attempted; ticket ${ID} is NOT delivered`)
          console.log(`= blocked ${BRANCH}: ${gate.reason}`)
          finish() // summary first, then exit 2
        }
        console.log(`+ checks  ${gate.counted.length} required context(s) concluded successfully (rule: ${gate.rule})`)
      } else {
        checks.requiredCheckRule = 'skipped-glab'
        note('required-check gate is GitHub-only in this version; the glab merge still respects server-side protection')
      }
      const mg = PLATFORM === 'gh'
        ? tryCli(['pr', 'merge', String(pr.number), '--merge'])
        : tryCli(['mr', 'merge', String(pr.number), '--yes'])
      if (!mg.ok) note(`forge merge failed (conflict, approval required, or a check that turned red after the gate): ${firstLine(mg.out)}`)
      else console.log(`+ merged  #${pr.number} via ${PLATFORM} (forge-side)`)
      tryGit(['fetch', 'origin', DEFAULT_BRANCH])
    }
    // confirm the merge actually landed on the remote default, then sync local
    if (tryGit(['merge-base', '--is-ancestor', BRANCH, `origin/${DEFAULT_BRANCH}`]).ok) {
      checks.merged = true
      checks.pushed = true // the forge landed it on origin
      git(['checkout', DEFAULT_BRANCH], { stdio: ['ignore', 'pipe', 'pipe'] })
      const ff = tryGit(['merge', '--ff-only', `origin/${DEFAULT_BRANCH}`])
      if (!ff.ok) note(`local fast-forward to origin/${DEFAULT_BRANCH} failed: ${firstLine(ff.out)} (DoD test-cmd runs against local ${DEFAULT_BRANCH})`)
    } else if (!checks.alreadyMerged) {
      // FND-20 deliverable 3: this is a HARD failure, not a note execution continues past. The
      // remote default branch does not contain the work, so checks.merged stays false, dodPassed
      // is therefore false, and finish() derives exit 2.
      note('merge did not land on the remote default branch — ticket is NOT delivered')
    }
    if (checks.alreadyMerged) checks.merged = true
  }

  // 4. close the tracker issue ONLY once the work landed (FND-20 deliverable 6 — keep this
  // precondition through any later tidying). A closed issue is what /start-all's resume filter
  // reads as "delivered by an earlier run", so closing it on an unlanded merge silently drops the
  // ticket from every future run. The same precondition governs the verdict-comment trail and any
  // Asana completion: nothing downstream may claim a delivery the default branch does not contain.
  const landed = checks.merged && (!checks.pushRequired || checks.pushed)
  if (!landed) note('skipping tracker close — merge/push did not complete, ticket is NOT delivered')
  else closeIssue()

  // 5. the DoD inputs (planExists / testsPassed) are evaluated inside finish(), so they are
  // always present in the summary — including on the early stops above.
  finish()
} catch (e) {
  note(`unexpected error: ${firstLine(errText(e))}`)
  finish(1)
}
