# Security and Privacy

General Assistant chats are stored under `chats/` separately from interview `sessions/`; neither store receives the Groq key. The host reads only explicitly attached small source files or targeted search matches when workspace context is enabled. Path traversal, symlinks outside the workspace, common secret filenames, dependencies, and generated folders are rejected. Model edit proposals target only attached existing files; the user must open each diff before the host applies a `WorkspaceEdit`, and changed/dirty files are rejected. The Assistant never runs model-suggested terminal commands.

**Milestone 3 implementation:** Groq requests originate only in the extension host. The Groq API key is stored in VS Code SecretStorage and sent in the Authorization header, never in the request URL, webview, or saved session files. Gemini and xAI keys are not reused. Assistant context is limited to the active workspace source and a short chat history; qualitative context uses verified snapshot source, answers, run evidence, and bounded chat history. Candidate text and source are treated as data. Groq output is schema-checked and all cited evidence IDs are verified locally. The 60-second timeout aborts the `fetch` request.

**Milestone 2 implementation:** The runner starts `process.execPath` with fixed arguments, `shell: false`, a timeout, bounded output, and an extension-owned harness. Only selected regular challenge files enter the snapshot. This local execution is not a security sandbox for hostile candidate code.

Codebase Detective is a local-practice extension. It is **not a sandbox for hostile code** and provides **no interview proctoring**.

| Area | Required control |
|---|---|
| Groq key | Store/retrieve only via VS Code SecretStorage; never webview state, files, logs, reports, source control or prompts |
| Webview | Restrictive nonce-based CSP; local packaged assets only where possible; no direct filesystem/shell/API access |
| Messages | Versioned Zod schemas, allowlisted action names, size limits, state/session validation; return safe error codes |
| Paths/files | Host derives roots; canonicalise and verify contained paths; reject traversal and unexpected link resolution; separate baseline/workspace/submission |
| Runner | Fixed registry runner ID→hard-coded configuration, controlled cwd/environment, no shell command from message/manifest, timeout/output caps, child cleanup |
| AI data | Send minimum selected/relevant challenge context; redact keys/tokens and avoid entire local workspace; disclose external transfer |
| Storage/logs | Keep local data only as long as needed for practice; avoid secrets/full prompts where unnecessary; validate records before use |
| Dependencies | Pin/audit packages, minimise dependencies, update for advisories, scrutinise build/VSIX supply chain |

Candidate code runs locally and may read/modify what the user can access through the process; a fixed command reduces accidental exposure but is not isolation. Users must not open untrusted challenges or treat this as malware containment. Network/API failures are expected and must fail closed for secrets while preserving local objective evidence. Remaining implementation questions include platform-specific symlink handling, secure process environment allowlist, data-retention UI, and exact CSP asset policy; resolve and test them before shipping.
