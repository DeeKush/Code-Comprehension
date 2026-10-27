async function execute(job, handlers) {
  const handler = handlers[job.kind];
  if (typeof handler !== 'function') throw new Error(`No handler for ${job.kind}`);
  return handler(job.payload);
}
module.exports = { execute };
