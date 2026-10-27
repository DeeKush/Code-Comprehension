# Delivery Roadmap

**Planning date:** 23 October 2026 (IST). **Official deadline confirmed by the supplied End-Term Software Project Submission Guidelines:** 27 October 2026, 11:59 PM IST. Dates are a compressed implementation plan, not a claim of completed work.

| Date | Milestone / deliverables | Dependencies & acceptance | Risk / defer first |
|---|---|---|---|
| 23 Oct | Extension + Vite/React foundation; commands, webview shell, bundled challenge skeleton | VS Code extension and webview build can load in a clean profile | Build/tooling friction; defer polish/themes |
| 24 Oct | Session lifecycle, workspace copies, persisted deadline/recovery, native file opening | Start/resume produces isolated workspace and correct clock after restart | Filesystem edge cases; defer multi-challenge selection |
| 25 Oct | Fixed runner, snapshots/diff, deterministic test score and report shell | Repeated tests log; submit once freezes and evaluates final files | Runner semantics; defer nonessential result visualisation |
| 26 Oct | Gemini configuration/assistant, structured assessment/retry; validation and error handling | Key stays in SecretStorage; AI failure leaves objective report; core automated tests pass | API/schema uncertainty; defer advanced prompt features |
| 27 Oct | Recovery/security/manual checks, VSIX packaging, docs, demo video, official submission form and final verification | Clean install/run, 3–5 minute demo, repository history, public/accessibility checks and checklist complete before deadline | Packaging/submission issue; defer all feature expansion |

## Exit gates

Do not progress past each day without its acceptance condition. On 27 October, freeze scope after a working end-to-end path; perform a fresh-profile package test, verify the documentation does not overclaim, record demo, and submit via the [official form](https://forms.gle/sBy4sfqyiRG2Zpom9). Open repository, accessible build/VSIX instructions and demo links in an incognito/private window before submission. If schedule slips, preserve the four core workflows and defer visual polish, multiple challenge variants, richer AI modes, analytics, and every out-of-scope feature. Do not defer persistence, snapshot integrity, fixed runner controls, or objective results: they provide engineering depth central to the rubric.
