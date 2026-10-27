const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_URL = 'https://api.groq.com/openai/v1/models';
const SECRET_NAME = 'codebaseDetective.groqApiKey';

function createGroqCredentials(secrets) {
  return {
    get: () => secrets.get(SECRET_NAME),
    async set(value) {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a non-empty Groq API key.');
      await secrets.store(SECRET_NAME, value.trim());
    },
    remove: () => secrets.delete(SECRET_NAME)
  };
}

function safeDetail(value, apiKey) {
  if (typeof value !== 'string') return '';
  return value.replaceAll(apiKey, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[URL redacted]')
    .replace(/(?:authorization|api[_ -]?key)\s*[:=]\s*\S+/gi, '[credential redacted]')
    .replace(/\bBearer\s+\S+/gi, '[credential redacted]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 300).trim();
}

function apiFailure(status, data, apiKey, model) {
  const rawType = data?.error?.type ?? data?.error?.code ?? data?.code;
  const code = typeof rawType === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(rawType) ? rawType : 'unknown';
  const detail = safeDetail(typeof data?.error === 'string' ? data.error : data?.error?.message ?? data?.message, apiKey);
  const reason = status === 400 ? 'Invalid request or unsupported parameter.'
    : status === 401 ? 'Authentication failed. Check the Groq API key.'
    : status === 402 ? 'Insufficient credits. Check Groq billing.'
    : status === 403 ? 'Access denied. Check Groq project and model permissions.'
    : status === 404 ? `Model "${model}" is unavailable, or the endpoint was not found. Check the Groq model setting.`
    : status === 408 ? 'Request timed out. Retry when the service is available.'
    : status === 413 ? 'Request too large. Reduce the context and retry.'
    : status === 429 ? 'Rate limit or quota reached. Retry later or check your Groq limits.'
    : status >= 500 ? 'Groq service error. Retry later.' : 'Groq request failed.';
  const error = new Error(`Groq HTTP ${status} (${code}): ${reason}${detail ? ` API: ${detail}` : ''}`);
  error.httpStatus = status;
  error.apiCode = code;
  return error;
}

async function requestJson({ apiKey, url, model, body, fetchImpl, signal }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('Groq API key is not configured.');
  if (typeof fetchImpl !== 'function') throw new Error('This VS Code runtime does not provide fetch. Update VS Code and retry.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once:true });
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
    if (!response || typeof response.ok !== 'boolean' || !Number.isInteger(response.status)) throw new Error('Groq returned an unexpected HTTP response.');
    let data;
    try { data = await response.json(); }
    catch { if (response.ok) throw new Error('Groq returned invalid JSON.'); }
    if (!response.ok) throw apiFailure(response.status, data, apiKey, model);
    return data;
  } catch (error) {
    if (error.httpStatus || error.message?.startsWith('Groq returned')) throw error;
    if (signal?.aborted) throw new Error('Groq request cancelled.');
    if (controller.signal.aborted || error?.name === 'AbortError') throw new Error('Groq request timed out. Check connectivity and retry.');
    throw new Error('Could not reach Groq. Check your network, DNS, or TLS connection and retry.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

async function callGroq({ apiKey, model, system, contents, messages, schema, maxTokens, signal, fetchImpl = globalThis.fetch }) {
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._/-]{2,100}$/.test(model)) throw new Error('Invalid Groq model setting.');
  if (typeof system !== 'string' || !system.trim() || (messages ? !Array.isArray(messages) || !messages.length : typeof contents !== 'string' || !contents.trim())) throw new Error('Groq prompt is missing.');
  const turns = messages || [{role:'user',content:contents}];
  if (turns.some(item => !['user','assistant'].includes(item?.role) || typeof item.content !== 'string' || !item.content.trim()) || system.length + turns.reduce((sum,item)=>sum+item.content.length,0) > 120000) throw new Error('Groq context is too large or malformed.');
  const body = {
    model,
    messages: [{ role: 'system', content: system }, ...turns],
    stream: false,
    max_completion_tokens: maxTokens ?? (schema ? 8192 : 2048),
    ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'candidate_assessment', strict: true, schema } } } : {})
  };
  const data = await requestJson({ apiKey, url: CHAT_URL, model, body, fetchImpl, signal });
  const choice = data?.choices?.[0];
  const result = choice?.message?.content;
  if (choice?.finish_reason === 'length') throw new Error('Groq response was truncated. Retry with less context.');
  if (typeof result !== 'string' || !result.trim()) throw new Error('Groq returned empty or malformed assistant output.');
  return result;
}

async function listGroqModels({ apiKey, fetchImpl = globalThis.fetch }) {
  const data = await requestJson({ apiKey, url: MODELS_URL, model: 'configured model', fetchImpl });
  if (!Array.isArray(data?.data)) throw new Error('Groq returned an unexpected models list.');
  return [...new Set(data.data.filter(item => item?.active !== false && typeof item?.id === 'string' && /^[a-zA-Z0-9._/-]{2,100}$/.test(item.id)).map(item => item.id))].sort().slice(0, 100);
}

module.exports = { CHAT_URL, createGroqCredentials, callGroq, listGroqModels };
