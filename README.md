# Codebase Detective

**Assistant first, Interview Lab optional:** a VS Code extension with a persistent Groq chat view, bounded workspace context, review-before-apply file edits, and the existing timed Retry Queue interview. Live Groq and multi-window UI behavior still need manual verification in VS Code.

Codebase Detective now opens as a workspace-aware coding companion. Attach the current file, a selection, another source file, or a folder; optionally include targeted workspace search results; ask follow-up questions in locally persisted chats. The separate Interview Lab retains the bundled JavaScript challenge, timer, fixed tests, frozen submission, scoring, and evidence-backed report.

## Main workflows

**Codebase Detective: Open Assistant** focuses the native Assistant view in Explorer. It supports multi-turn chat, cancellation, retry, copy, safe Markdown/code display, context chips, Groq settings, explicit insertion of a response code block at the cursor, and a **Propose edit** action. A proposal is limited to attached existing files; each file must be previewed in VS Code's diff editor before the host applies it with `WorkspaceEdit`. The assistant does not execute model-generated commands.

**Codebase Detective: Open Interview Lab** opens the existing timed workflow. Start Interview saves the session first, then asks VS Code to open the writable challenge folder in a new window. The new extension host matches that folder to the saved session, restores the original deadline, opens `queue.js`, and focuses the Assistant view. Use Interview Lab in that window for tests, written answers, submission, and reports. If the window fails to open, use **Codebase Detective: Open Active Interview Workspace** to retry without creating another session.

## Stack and local setup

Current stack: JavaScript VS Code extension, React/JSX webview built with Vite, Zod validation, the Groq Chat Completions API over the extension host's `fetch`, Node built-in tests, VS Code SecretStorage, and extension global storage. A recent Node.js/npm and VS Code 1.85 or newer are required.

Run `npm install`, then `npm run build` and `npm test`. Open this folder in VS Code, press F5 using **Run Extension**, then run **Codebase Detective: Open Assistant**. Obtain a Groq API key from [Groq Console](https://console.groq.com/keys) and configure it with **Codebase Detective: Configure Groq API Key** or Assistant settings; the key is stored in VS Code SecretStorage. Use **Test connection** for a small real request. The default model is `openai/gpt-oss-120b`, configurable through `codebaseDetective.groqModel`. General chats live under extension global storage's `chats/`; interview sessions remain under `sessions/`. `npm run package` builds a VSIX. When checking the separate interview window from an Extension Development Host, install the VSIX if VS Code does not carry the development extension into that second window.

## Security and limits

The webviews receive no API secrets or direct filesystem/shell access. The host validates messages and paths, excludes common secret and generated files from context, and uses fixed runner IDs for interview tests. Candidate code executes locally: this is not a hostile-code sandbox and has no remote sync/accounts. The Assistant currently uses non-streaming Groq requests; Stop aborts the request. Proposed edits replace only approved existing small files after a diff review. Native view placement is controlled by VS Code; if it does not move to the Secondary Side Bar automatically, move the Assistant view there with VS Code's view menu.

## Demo and submission checklist

- Implement and clean-profile-test all four workflows.
- Package and install the VSIX; create accessible runnable build instructions.
- Record a truthful 3–5 minute demo.
- Maintain meaningful Git history, complete documentation, and submit the [official form](https://forms.gle/sBy4sfqyiRG2Zpom9) by **27 October 2026, 11:59 PM IST** (confirmed by the supplied guidelines).
- Before final submission, open the repository, accessible build/installation instructions, and demo link in an incognito/private window to confirm evaluator access.

## Documentation

- [Product requirements](docs/PRD.md)
- [Technology stack](docs/TECH_STACK.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Workflows](docs/WORKFLOWS.md)
- [Assessment rubric](docs/ASSESSMENT_RUBRIC.md)
- [Retry Queue challenge](docs/CHALLENGE_SPEC.md)
- [Roadmap](docs/ROADMAP.md)
- [Test plan](docs/TEST_PLAN.md)
- [Security](docs/SECURITY.md)
