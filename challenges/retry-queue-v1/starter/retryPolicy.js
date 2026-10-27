// Delays are deliberately tiny so callers can exercise the queue locally.
function retryDelay(attempt, baseMs = 25, maxMs = 1000) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt must be positive');
  return Math.min(maxMs, baseMs * (2 ** (attempt - 1)));
}
function shouldRetry(attempt, maxAttempts) {
  return attempt < maxAttempts;
}
module.exports = { retryDelay, shouldRetry };
