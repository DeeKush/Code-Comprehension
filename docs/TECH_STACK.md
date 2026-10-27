# Technical Stack

The Assistant and Interview Lab are separate React/JSX entries in the same Vite build (`media/ui/assistant.html` and `media/ui/index.html`). The Assistant is a VS Code `WebviewView`; the Interview Lab remains a webview panel. Node filesystem storage holds general chats separately from interview sessions. Reviewed edits use VS Code `WorkspaceEdit`, not shell commands.

**Status:** the JavaScript extension, React webviews, local storage, Groq REST client, and tests are implemented. The new Assistant layout and cross-window workflow still require manual VS Code verification.

| Layer | Decision | Purpose |
|---|---|---|
| Platform | VS Code extension, JavaScript | Native editor, commands, filesystem/storage integration without a separate service |
| UI | React + JSX webview | Stateful interview console |
| UI build | Vite | Bundle the webview assets during extension packaging |
| Validation | Zod | Validate webview messages and Groq structured output at trust boundaries |
| AI | Groq Chat Completions API REST via extension-host `fetch` | Host-only contextual assistance and qualitative assessment |
| Persistence | `ExtensionContext.globalStorageUri` + VS Code SecretStorage | Local records/snapshots and API key respectively |
| Tests | Node’s built-in test runner or a fixed selected JavaScript runner (open decision) | Run only bundled challenge tests |
| Distribution | `vsce`/current VS Code VSIX packaging tool (to verify) | Package extension and built webview |

## Decisions and rationale

JavaScript is selected—not TypeScript—to meet the stated architecture and reduce initial setup/typing overhead in a time-limited academic MVP. This is a product decision, not a claim that JavaScript is universally superior. Runtime schemas and focused tests compensate for fewer compile-time checks.

React/JSX provide a maintainable stateful console; Vite provides a conventional webview build pipeline. The extension host owns lifecycle, deadline, registry, workspace/snapshots, file operations, AI context/request, runner, events, deterministic scoring, report persistence and command registration. The webview only renders UI and asks the host through validated messages.

Groq calls use an API key retrieved only by the host from SecretStorage and sent in the `Authorization: Bearer` request header. The model ID is configuration. Direct REST avoids an SDK initialization failure in the VS Code extension host; response structure and qualitative evidence are validated locally with Zod.

## Storage and runner

Global storage holds JSON metadata/events/reports and session directories; atomic write/replace behaviour and recovery semantics remain implementation work. A working workspace, immutable baseline, and immutable submission snapshot are separate. The runner maps a known challenge runner ID to a hard-coded command/config; it does not consume commands from manifests or the webview. Process timeout, output cap, cwd/path allowlist and result parsing are mandatory.

## Excluded MVP technology

No TypeScript, Express/server backend, cloud database, remote sync, accounts, GitHub import, cloud sandbox, custom editor, or remote test service. These exclusions keep the demonstration focused on the four workflows.

## Alternatives considered

| Alternative | Why not for MVP |
|---|---|
| Hosted backend/database | Adds auth, deployment and privacy work without serving local-practice core |
| Electron/custom editor | Duplicates VS Code’s editor and increases scope |
| Direct webview Groq calls | Exposes secrets and bypasses host control |
| Arbitrary manifest shell command | Unsafe and difficult to validate |
| Deterministic-only qualitative feedback | Loses contextual coaching; retain deterministic correctness as authoritative |

Dependencies and exact versions are intentionally not specified until package implementation begins; they must be pinned then, audited, and documented in the lockfile.
