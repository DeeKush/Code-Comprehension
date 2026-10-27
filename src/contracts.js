const { z } = require('zod');
const challenge = z.object({ id: z.literal('retry-queue-v1'), title: z.string().min(1).max(100), description: z.string().min(1).max(500), durationMinutes: z.number().int().min(1).max(240), entryFile: z.string().regex(/^[a-zA-Z0-9_./-]+\.js$/), runnerId: z.literal('retry-queue-v1') }).strict();
const session = z.object({ id: z.string().uuid(), challengeId: z.literal('retry-queue-v1'), startedAt: z.number().int().positive(), deadlineAt: z.number().int().positive(), status: z.enum(['RUNNING','TIMED_OUT','SUBMITTING','EVALUATING','EVALUATION_FAILED','COMPLETED']), workspace: z.string().min(1), baseline: z.string().min(1), submissionRequestedAt: z.number().int().optional(), submittedAt: z.number().int().optional(), snapshot: z.string().optional(), finalRunId: z.string().uuid().optional(), objectiveScore: z.number().min(0).max(35).optional(), scoringStatus: z.enum(['PENDING','COMPLETE','FAILED']).optional(), answersHash: z.string().length(64).optional(), qualitativeStatus: z.enum(['PENDING','RUNNING','FAILED','COMPLETE']).optional(), reportVersion: z.number().int().nonnegative().optional() }).strict();
const incoming = z.discriminatedUnion('type', [
  z.object({ type: z.literal('getInitialState'), payload: z.object({}).strict() }).strict(),
  z.object({ type: z.literal('getSessionState'), payload: z.object({}).strict() }).strict(),
  z.object({ type: z.literal('startInterview'), payload: z.object({ challengeId: z.literal('retry-queue-v1') }).strict() }).strict(),
  ...['runTests','getTestRuns','getObjectiveReport','retrySubmission','retryEvaluation','retryAssessment'].map(type => z.object({ type: z.literal(type), payload: z.object({ sessionId: z.string().uuid() }).strict() }).strict()),
  z.object({type:z.literal('submitSession'),payload:z.object({sessionId:z.string().uuid(),answers:z.object({rootCause:z.string().max(3000),implementation:z.string().max(3000),verification:z.string().max(3000),aiSupervision:z.string().max(3000)}).strict()}).strict()}).strict(),
  z.object({type:z.literal('askAssistant'),payload:z.object({sessionId:z.string().uuid(),mode:z.enum(['explain','investigate','review','fix']),question:z.string().min(1).max(2000),selection:z.string().max(4000).optional()}).strict()}).strict(),
  ...['configureGroq','testGroq','removeGroqKey','refreshGroqModels'].map(type => z.object({type:z.literal(type),payload:z.object({}).strict()}).strict())
]);
function remainingMs(record, now = Date.now()) { return Math.max(0, record.deadlineAt - now); }
function refreshSession(record, now = Date.now()) { return record.status === 'RUNNING' && remainingMs(record, now) === 0 ? { ...record, status: 'TIMED_OUT' } : record; }
function serializeSession(record) { const valid = session.parse(record); if (valid.deadlineAt <= valid.startedAt) throw new Error('Invalid session deadline'); return JSON.stringify(valid, null, 2); }
function deserializeSession(text) { const value = JSON.parse(text); if (value.status === 'TIMED_OUT') value.status = 'SUBMITTING'; return session.parse(value); }
function assertCanStart(record) { if (record) throw new Error('An interview already exists. Complete this session before starting another.'); }
module.exports = { challenge, session, incoming, remainingMs, refreshSession, serializeSession, deserializeSession, assertCanStart };
