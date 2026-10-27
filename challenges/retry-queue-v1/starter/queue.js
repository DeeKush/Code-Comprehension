const { retryDelay, shouldRetry } = require('./retryPolicy');
const { execute } = require('./worker');

class RetryQueue {
  constructor(handlers, options = {}) {
    this.handlers = handlers;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 25;
    this.pending = [];
    this.jobs = new Map();
    this.running = false;
    this.listeners = new Set();
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, job, detail) {
    for (const listener of this.listeners) listener({ type, id: job.id, attempt: job.attempt, detail });
  }

  enqueue(input) {
    if (!input || typeof input.id !== 'string' || !input.id) throw new Error('Job id is required');
    if (this.jobs.has(input.id)) throw new Error(`Duplicate job: ${input.id}`);
    const job = { id: input.id, kind: input.kind, payload: input.payload, attempt: 0, state: 'pending' };
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    this.emit('queued', job);
    void this.drain();
    return job.id;
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const id = this.pending.shift();
        const job = this.jobs.get(id);
        if (!job || job.state === 'done') continue;
        await this.run(job);
      }
    } finally {
      this.running = false;
    }
  }

  async run(job) {
    job.state = 'running';
    job.attempt += 1;
    this.emit('started', job);
    try {
      const result = await execute(job, this.handlers);
      job.state = 'done';
      this.emit('completed', job, result);
    } catch (error) {
      this.emit('failed', job, error.message);
      if (!shouldRetry(job.attempt, this.maxAttempts)) {
        job.state = 'failed';
        this.emit('exhausted', job);
        return;
      }
      job.state = 'waiting';
      const delay = retryDelay(job.attempt, this.baseDelayMs);
      setTimeout(() => {
        job.state = 'pending';
        this.pending.push(job.id);
        this.emit('retryScheduled', job, delay);
        void this.drain();
      }, delay);
      this.pending.push(job.id);
    }
  }

  status(id) {
    const job = this.jobs.get(id);
    return job ? { id: job.id, attempt: job.attempt, state: job.state } : null;
  }
}
module.exports = { RetryQueue };
