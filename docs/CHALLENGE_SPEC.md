# Challenge Specification — Debug the Retry Queue

**Implementation update (milestone 2):** The starter, fixed `retry-queue-v1` runner, controlled harness, per-run results, and submission snapshot are implemented. The five objective cases cover success, retry, duplicate execution, attempt exhaustion, and duplicate IDs. The older planned-status language below describes the original design and is superseded for these components.

**Status:** bundled JavaScript starter and controlled test harness implemented. Live extension verification is pending.

## Candidate-facing brief

You inherit a small JavaScript retry-queue library used to schedule failed asynchronous jobs. Reports indicate jobs can be retried incorrectly under failure/re-entrancy conditions. Inspect the repository, identify the root cause, implement a focused fix, and use the provided tests to verify it. Explain your diagnosis and what you tested. You may use the assistant for explanation, investigation, review, or a suggested approach; verify advice yourself.

The intended repository is approximately 5–8 small source/test files, deliberately readable in an interview session. Candidate-relevant modules are planned as `queue.js` (scheduling/state), `retryPolicy.js` (delay/attempt rules), `worker.js` (execution boundary), and fixed tests/fixtures. Exact paths are implementation details to be finalised.

## Candidate actions and acceptance

Candidate should trace enqueue → execute → failure → retry → completion, reproduce a failing scenario, change only the working copy, run tests, and submit one explanation/fix. A valid solution must preserve one active execution per job, apply bounded attempt handling, avoid duplicate requeue on failure, and retain successful completion behaviour. Fixed tests should cover success, retryable failure, max attempts, duplicate scheduling/re-entrancy, and queue-empty/error edge cases. Exact API compatibility is an open design detail and must be defined with the starter repository.

## Reference-only assessment material

Expected diagnosis (hidden from the candidate briefing) is that the faulty queue’s failure/retry state transition permits duplicate scheduling or loses a guard under asynchronous/re-entrant execution. This is a reference hypothesis to implement and test, not evidence that code already exists. Assessment evidence includes final tests, final diff, candidate explanation naming relevant flow/state, run history, and verification of AI suggestions rather than amount of AI use.

## Runner and workspace contract

Registry maps challenge ID `retry-queue-v1` to a fixed runner ID and fixed packaged evaluation configuration. The host copies immutable starter content to `baseline/` and `workspace/`; candidate edits only `workspace/`. Evaluation harness/test fixtures remain packaged/controlled and final files copy to `submission/` before evaluation. No manifest or message may provide a shell command. Runner returns `{status, passed, total, namedResults, durationMs, outputTruncated}` under timeout/output limits.

Constraints: JavaScript only; no network dependency; local practice only; no hostile-code sandbox; no assertion that test coverage proves all correctness. The report must distinguish test facts from qualitative inference.
