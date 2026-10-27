# Product Requirements Document — Codebase Detective

**Status:** The original interview MVP and a new Assistant-first companion are implemented in code; live VS Code multi-window and Groq behavior still require manual verification. The detailed interview requirements below describe the preserved Interview Lab. **Academic source:** End-Term Software Project Submission Guidelines supplied with this project. **Submission deadline:** 27 October 2026, 11:59 PM IST.

## Product

Codebase Detective is a local-first Visual Studio Code extension for practising a code-comprehension interview. A candidate receives an unfamiliar bundled JavaScript repository, investigates a bug in VS Code, may ask a contextual Groq assistant for help, changes code, runs fixed tests, submits once, and receives an evidence-backed practice report. It is not a generic chatbot, hiring system, or coding-exercise catalogue.

### Users and needs

| User | Need / pain point | Product response |
|---|---|---|
| Student or junior developer | Practise explaining and debugging unfamiliar code under time pressure | Timed, structured investigation and feedback |
| Candidate preparing for interviews | See whether a proposed fix actually works | Fixed tests, frozen submission, deterministic correctness result |
| Self-directed developer | Use AI without outsourcing judgment | Contextual assistance plus evidence-based review of verification |

## Vision, goals, and non-goals

**Vision:** realistic, repeatable code-comprehension practice inside the editor developers already use.

**MVP goals:** deliver one complete challenge; recover a local session; enforce a persisted deadline; support investigation, testing, one submission, and a saved report; handle Groq failure without losing objective results.

**Non-goals:** arbitrary GitHub imports, multiple languages, a custom editor, remote execution/database/accounts, leaderboards, proctoring, a marketplace, or a claim that the score predicts hiring outcomes.

## Academic alignment

The supplied guidelines require a working application, meaningful logic, relevant error handling/security, appropriate persistence, meaningful Git history, an accessible build/deployment, documentation, a 3–5 minute demo, and a completed submission form. They require links to be accessible to evaluators and state that submission is complete only after the official form is completed. They warn that CRUD, UI-only, API-wrapper, tutorial-clone, and incomplete products are insufficient, and recommend 3–5 strong workflows. These are **official requirements**, not product choices.

| Official evaluation criterion | Weight | Planned evidence |
|---|---:|---|
| Problem and product understanding | 10% | PRD, challenge rationale, demo narrative |
| Core product implementation | 25% | Complete start→submit→report path |
| Engineering and application logic | 20% | Timer, snapshots, runner, scoring, recovery |
| Architecture and technical decisions | 15% | Architecture, boundaries, trade-offs |
| UX and reliability | 10% | Clear states, errors, retry and recovery |
| Code quality and project structure | 10% | Modular implementation and tests |
| Deployment and documentation | 10% | VSIX, README, docs, demo/checklist |

## Core workflows and stories

1. **Start:** As a candidate, I select “Debug the Retry Queue,” read its brief, start once, and receive a clean copy. *Accept:* a session ID, started time, deadline, workspace and event are persisted; relevant files open.
2. **Investigate:** As a candidate, I navigate code, form a hypothesis, ask one of four assistance modes (explain, investigate, review, suggest), and edit only myself. *Accept:* the assistant never writes code; host validates every request.
3. **Test and submit:** As a candidate, I run designated tests repeatedly and submit my final work. *Accept:* each run is logged; final snapshot/diff/test result is immutable; duplicate submission is rejected.
4. **Report:** As a candidate, I view saved objective results and qualitative feedback. *Accept:* objective report persists even when Groq is unavailable, and qualitative generation can retry.

## Functional requirements

- Bundled challenge registry and clean per-session workspace creation.
- Native editor plus webview console with briefing, host-authoritative countdown, assistant, results and report.
- Session states: `created`, `active`, `submitting`, `assessing`, `report_ready`, `assessment_retryable`, `expired`, `failed`.
- Persist metadata, event log, immutable baseline/submission snapshots, report and status locally.
- Fixed runner IDs only; controlled test process; deterministic correctness score.
- SecretStorage-held Groq key; configurable model; locally validated structured assessment.

## Non-functional requirements

Reliable restart recovery and wall-clock deadlines; clear actionable errors; least-privilege webview/host boundary; bounded runner duration/output; accessible readable console; modular JavaScript units suitable for tests. Performance targets are implementation estimates, not verified benchmarks: state changes should feel immediate; lengthy work must show progress/cancellation state.

## Scope, success, and risks

The MVP includes exactly one JavaScript challenge, lifecycle/recovery, timer, native editing, Groq assistance, fixed tests, snapshots, deterministic + qualitative report, automated tests, VSIX and documentation. Success is a demonstrable, end-to-end 3–5 minute workflow with no data loss across restart and a truthful report when external AI fails. It is not commercial growth measured by MAUs.

Assumptions/risks: Groq credentials/network may fail; local candidate code is unsafe; VS Code storage APIs and Node runner semantics require implementation validation; short schedule risks overbuilding. Mitigate by keeping challenge and runner fixed, making objective scoring independent, testing recovery, deferring extras, and using small meaningful Git commits.

## Definition of done

One challenge can be started, resumed, tested, submitted once and reported; deadline uses persisted time; snapshots/events/reports survive restart; bad messages/paths/AI output are rejected safely; automated and manual checks pass; VSIX installs/runs in a clean VS Code profile; README/docs, demo video, submission form and repository history are ready before the official deadline. Final repository, build/VSIX and demo links are opened in an incognito/private window to confirm evaluator access.
