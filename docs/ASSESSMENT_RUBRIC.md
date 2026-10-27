# Assessment Rubric

**Milestone 3 implementation:** Groq assesses only root cause (20), comprehension (15), code quality (15), debugging strategy (10), and AI supervision (5). Each response must include bounded points, a rationale, confidence, and IDs that exist in the submitted evidence package. The host validates these and adds the saved deterministic correctness score (35 maximum) to form a practice score out of 100. Failed or missing qualitative assessment leaves the objective score visible and the overall score absent. This rubric has not been experimentally validated.

Retry Queue correctness uses five fixed tests worth 4 (success), 8 (retry), 12 (overlap), 7 (exhaustion), and 4 (duplicate ID) points. The score is `35 × passedPoints / 35`, rounded to two decimals, only after a completed final run against a verified submission snapshot. Runner errors, skipped tests, or malformed output produce an incomplete score, not zero.

This is a practice rubric, not an experimentally validated hiring measure. It must not be represented as a hiring decision. Weights total **100%**.

| Criterion | Weight | Evidence required | Method |
|---|---:|---|---|
| Correctness and tests | 35 | final evaluation result, named test outcomes | deterministic |
| Root-cause diagnosis | 20 | submitted explanation linked to files/behaviour | Groq-guided, schema/evidence validated |
| Codebase comprehension | 15 | explanation of relevant flow/modules | qualitative |
| Code quality | 15 | immutable final diff and evaluation facts | qualitative with constraints |
| Debugging/testing strategy | 10 | run history, explanation, test outcomes | qualitative |
| AI supervision/verification | 5 | prompts/responses (metadata), candidate verification evidence | qualitative; prompt count alone is never scored |

## Formula

For a valid final run, correctness is `35 × passedPoints / totalPoints`, rounded to two decimals. The fixed Retry Queue suite totals 35 points. Timeouts, malformed output, and unavailable tests leave correctness incomplete. The five qualitative scores total at most 65; an overall score is saved and shown only after local validation succeeds.

## Qualitative rules

Groq receives a curated explanation, final diff, test history and cited code excerpts—not secrets or unnecessary files. It may identify strengths, weaknesses, evidence IDs, uncertainty, and exercises; it must not invent test results. Zod validation requires:

```json
{
  "criteria": [{"id":"rootCause","points":0,"evidenceIds":["event:12"],"rationale":"...","confidence":"low|medium|high"}],
  "overallNarrative":"...",
  "limitations":["..."],
  "followUps":["..."]
}
```

Points must be numeric/in range; IDs must exist in the immutable evidence index; rationale is required; a criterion without its required evidence gets `N/A`, not fabricated points. Contradictory claims (for example, passing test asserted when final result says fail) are rejected or flagged for retry. A low confidence label communicates uncertainty, not a bonus/penalty. Failed API calls, malformed output, and invalid citations retain objective report and make qualitative assessment retryable.

## Report structure

1. Session/challenge/status and prominent practice-only disclaimer.
2. Overall score or incomplete status, available evidence and criterion table.
3. Objective final tests and frozen snapshot/diff references.
4. Strengths, improvements, uncertainty/limitations.
5. Concrete follow-up exercises and assessment retry control where applicable.
