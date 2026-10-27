const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const vscode = require('vscode');

async function renderWebview(webview, extensionPath, page) {
  const buildRoot = path.join(extensionPath, 'media', 'ui');
  webview.options = { enableScripts:true, localResourceRoots:[vscode.Uri.file(buildRoot)] };
  const html = await fs.readFile(path.join(buildRoot, page), 'utf8');
  const nonce = crypto.randomBytes(16).toString('base64');
  const rewritten = html.replace(/(src|href)="([^"]+)"/g, (_full, attr, value) => {
    const relative = value.replace(/^\.?\//, '');
    if (!/^assets\/[a-zA-Z0-9_./-]+$/.test(relative) || relative.includes('..')) throw new Error('Unexpected webview asset path.');
    return `${attr}="${webview.asWebviewUri(vscode.Uri.file(path.join(buildRoot, relative)))}"`;
  });
  webview.html = rewritten.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">`).replace(/<script /g, `<script nonce="${nonce}" `);
}

module.exports = { renderWebview };
