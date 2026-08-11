---
description: Run the Builder stage on a planned ticket (three-agent pattern)
argument-hint: <ticket-id>
---

Launch the **builder** subagent for ticket $ARGUMENTS, pointing it at the ticket file and its plan at `docs/plans/$ARGUMENTS.md` (adjust the path if the plan lives elsewhere).

Refuse to start if the plan file does not exist — `/plan-ticket` runs first.

**Before launching the builder, run `node .claude/scripts/check-pipeline-config.mjs` and STOP if it reports `ok:false`.** The Builder checks out `ticket/<id>`, and outside a parallel lane that happens in the main working tree — so a branch whose base predates a change to `.claude/**` silently rolls the pipeline's own agents, scripts and hooks back to that older state (observed 2026-08-11: a fix round on `ticket/DATA-02` ran the archived Claude Builder instead of the Codex one, and nothing said so). Report the drift and stop; do **not** repair it by merging, resetting or checking anything out — that is a human's call, and merging the default branch into a ticket branch also changes the diff the Reviewer will judge. If the tree is sitting on a stale ticket branch, the human restores it *and restarts the session*: agent definitions are loaded once per CLI process, so refreshing the files alone leaves this session's stale agents in place. Ask the builder to re-run the same command as its last action and report the result, since the drift can appear *during* its checkout.

When the builder returns, show its diff summary, actual test output, and Deviations note, then STOP. Do not merge; clearance requires `/review-ticket` in a fresh context.

Hard rule: this stage runs in the **builder** subagent, never inline in this session — no matter how small the change looks. If the subagent cannot be launched or fails, report that and stop — do not absorb its role.
