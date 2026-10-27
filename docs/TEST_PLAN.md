# Test Plan

**Version 0.2 checks:** pure Node tests cover general chat persistence and multi-turn history, corrupt chat handling, workspace path/size exclusions, patch approval and stale-source checks, Assistant message validation, Groq multi-turn/cancellation, and matching a recovered interview to a second host's workspace. Manual Extension Development Host checks are still required for native view placement, the new window, editor selection, diff preview/application, and end-to-end assessment.

**Milestone 3 automated coverage:** mocked Groq success/errors/empty output, missing key, SecretStorage adapter, model list, bounded workspace context and traversal rejection, missing-answer evidence, malformed assessment, invalid citation, criterion bounds, and 100-point calculation. A live Groq request, real VS Code SecretStorage interaction, and webview behavior require an Extension Development Host manual check.

**Milestone 2 checks implemented:** pure Node tests exercise starter failure, a corrected copy, snapshot independence and hashes, malformed harness output, infrastructure failure, bounded timeout/output, and deterministic weighted score. Manual Extension Development Host verification is still required.

**Status:** pure Node automated checks have passed locally; editor/webview/package experiences still need a manual Extension Development Host check.

| Area | Automated check / expected result | Manual verification |
|---|---|---|
| Session lifecycle | Start creates unique ID, clean workspace, absolute deadline and event; invalid transition/duplicate submit is rejected | Commands and status copy are understandable |
| Timer/recovery | Simulated clock expiry across restart becomes `expired`; active state resumes; incomplete transition reconciles safely | Close/reopen VS Code and inspect countdown/status |
| Workspace/snapshots | Baseline is unchanged; traversal/symlink-like invalid paths rejected; submission is immutable and diff matches frozen files | Edit after submission and confirm report does not change |
| Runner | Known ID only; pass/fail parsed; timeout, nonzero exit, huge output and missing executable yield bounded error event | Run tests repeatedly and read output |
| Scoring | `35*p/n` correct for 0/all/partial; weights sum 100; N/A evidence prevents a false complete score | Compare rendered breakdown to stored facts |
| Groq | absent key, network error, malformed JSON, invalid score, unknown evidence ID and contradiction all preserve objective report and enable retry where applicable | Configure/revoke key and read user-facing guidance |
| Persistence | JSON schema validation, atomic-write interruption/recovery, corrupt record handling | Restart after start/test/submit/report |
| Webview/security | malformed/unknown/stale messages, oversized fields, unauthorized state actions rejected; CSP disallows unsafe sources | Check console has no secret/path leakage |
| Package/integration | Extension activates, commands register, bundled challenge resolves, webview assets load in clean profile | Install VSIX and complete start→test→submit→report |

## Test levels

Unit-test schemas, state machine/deadline calculations, path canonicalisation, context redaction, runner result parser, score calculator, report/evidence validator and storage serializer. Extension integration tests exercise command→host→storage boundaries with temporary directories/mocked Groq/runner. End-to-end checks exercise all four workflows in a clean VS Code profile. Use deterministic clocks, runner fixtures and mock AI responses.

## Manual demo acceptance checklist

- [ ] Start bundled Retry Queue challenge and inspect native files.
- [ ] Show timer, restart recovery, and an expired-session guard.
- [ ] Ask each assistant mode or clearly show unavailable-key state; verify no edit occurs.
- [ ] Run a failing then passing fixed test scenario.
- [ ] Submit once; show frozen final result and duplicate rejection.
- [ ] Show report, objective evidence, uncertainty/disclaimer, and qualitative retry path.
- [ ] Install/test packaged VSIX in a clean profile.
- [ ] Record a truthful 3–5 minute demonstration and complete submission requirements.
- [ ] Open GitHub repository, accessible build/installation instructions, and demo link in an incognito/private window; complete the [official submission form](https://forms.gle/sBy4sfqyiRG2Zpom9).
