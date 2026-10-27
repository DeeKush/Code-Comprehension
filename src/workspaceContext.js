const fs = require('node:fs/promises');
const path = require('node:path');

const EXCLUDED = /(^|[\\/])(?:\.git|node_modules|dist|build|coverage|\.vscode|\.idea)(?:[\\/]|$)/i;
const PRIVATE = /(^|[\\/])(?:\.env(?:\..*)?|\.npmrc|\.pypirc|.*\.(?:pem|key|p12|pfx)|id_rsa|.*(?:secret|credential|token|api[-_]?key).*?)(?:$|[\\/])/i;

function safeRelative(root, candidate) {
  if (typeof candidate !== 'string' || !candidate || path.isAbsolute(candidate) || candidate.includes('\0')) throw new Error('Invalid workspace path.');
  const target = path.resolve(root, candidate);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || EXCLUDED.test(relative) || PRIVATE.test(relative)) throw new Error('File is outside the allowed workspace context.');
  return { target, relative:relative.replace(/\\/g,'/') };
}

async function readContextFile(root, candidate, maxBytes = 16000) {
  const { target, relative } = safeRelative(root, candidate);
  const realRoot = await fs.realpath(root);
  const real = await fs.realpath(target);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error('Linked file leaves the workspace.');
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size > maxBytes || stat.size === 0) throw new Error('File is unavailable or too large for context.');
  const content = await fs.readFile(real, 'utf8');
  if (content.includes('\0')) throw new Error('Binary files cannot be sent as context.');
  return { path:relative, content, bytes:stat.size };
}

function boundedHistory(messages) {
  return messages.slice(-12).map(item => ({ role:item.role, content:String(item.content).slice(0,5000) }));
}

module.exports = { safeRelative, readContextFile, boundedHistory };
