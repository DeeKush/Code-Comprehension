# Debug the Retry Queue

This small library schedules asynchronous jobs and retries failures. A reported bug causes certain jobs to run more than once. Trace the queue state through enqueue, execution, failure, and retry. Identify the root cause and make a focused fix. The interview panel shows your deadline. Automated evaluation will be added in a later milestone.

Start with `queue.js`, then inspect `worker.js` and `retryPolicy.js`. Edit this session workspace; the bundled starter remains unchanged.
