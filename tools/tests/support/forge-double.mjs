// A scripted `gh` stand-in for tools/tests/deliver-ticket.test.mjs (FND-20).
//
// It is driven through the delivery script's EXISTING seam — `GH_BIN="node <this file>"`,
// documented at .claude/scripts/deliver-ticket.mjs's cli() helper — so no seam is added to
// production code for testability.
//
// It reads a JSON scenario from the path in FORGE_DOUBLE_SCENARIO, appends every invocation to
// the scenario's call log (JSONL) so a test can assert that a call was NOT made, and replays
// scripted responses. `rollupPhases` is indexed by the number of prior rollup reads, which is what
// produces "pending on the first poll, concluded on a later one".
//
// This file names and reads no credential: `gh auth status` simply exits 0. tools/** is inside the
// repository secret scan, so a credential-shaped identifier here would fail the suite it belongs
// to.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const scenarioPath = process.env.FORGE_DOUBLE_SCENARIO;
if (!scenarioPath || !existsSync(scenarioPath)) {
  process.stderr.write(`forge-double: FORGE_DOUBLE_SCENARIO is unset or missing: ${scenarioPath}\n`);
  process.exit(1);
}
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const argv = process.argv.slice(2);

appendFileSync(scenario.callLog, `${JSON.stringify({ argv })}\n`);

function priorCalls(predicate) {
  const lines = readFileSync(scenario.callLog, 'utf8').split('\n').filter(Boolean);
  // The current call is already appended, so exclude it.
  return lines.slice(0, -1).map((line) => JSON.parse(line).argv).filter(predicate).length;
}

function out(text) {
  process.stdout.write(typeof text === 'string' ? text : JSON.stringify(text));
  process.stdout.write('\n');
  process.exit(0);
}

const isRollupRead = (a) => a[0] === 'pr' && a[1] === 'view' && a.includes('statusCheckRollup');

if (argv[0] === 'auth' && argv[1] === 'status') process.exit(0);

if (argv[0] === 'pr' && argv[1] === 'list') out(scenario.prList ?? []);

if (argv[0] === 'pr' && argv[1] === 'create') {
  if (scenario.prCreateFails) {
    process.stderr.write('forge-double: pr create refused by the scenario\n');
    process.exit(1);
  }
  out(scenario.prUrl);
}

if (argv[0] === 'pr' && argv[1] === 'comment') process.exit(0);

if (argv[0] === 'api' && String(argv[1]).includes('required_status_checks')) {
  if (scenario.protection === null || scenario.protection === undefined) {
    process.stderr.write('forge-double: HTTP 404: Branch not protected\n');
    process.exit(1);
  }
  out(scenario.protection);
}

if (isRollupRead(argv)) {
  const phases = scenario.rollupPhases ?? [[]];
  const index = Math.min(priorCalls(isRollupRead), phases.length - 1);
  out({ statusCheckRollup: phases[index] });
}

if (argv[0] === 'pr' && argv[1] === 'merge') {
  if (scenario.mergeLands) {
    // Land it for real on the bare origin, so the delivery script's own post-merge ancestor check
    // decides the outcome. A test never takes "merged" from this double's say-so.
    execFileSync('git', [
      '--git-dir', scenario.originDir,
      'update-ref', `refs/heads/${scenario.defaultBranch}`, `refs/heads/${scenario.branch}`,
    ]);
  }
  process.exit(scenario.mergeExitCode ?? 0);
}

if (argv[0] === 'issue' && argv[1] === 'list') out(scenario.issues ?? []);

if (argv[0] === 'issue' && argv[1] === 'close') {
  writeFileSync(scenario.issueClosedMarker, 'closed');
  process.exit(0);
}

if (argv[0] === 'issue' && argv[1] === 'view') {
  out({ state: existsSync(scenario.issueClosedMarker) ? 'CLOSED' : 'OPEN' });
}

process.stderr.write(`forge-double: unhandled: ${argv.join(' ')}\n`);
process.exit(1);
