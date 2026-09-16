// Public surface of the Claude boundary. Server-only by design (CLAUDE.md "Auth boundary"): Client Components
// never import lib/llm; pure engines take the schema *types* from ./schemas.ts directly.
import 'server-only';

export * from './config.ts';
export * from './schemas.ts';
export * from './types.ts';
export * from './prompts.ts';
export * from './evaluate.ts';
export { evaluate, getAnthropic } from './client.ts';
export { fakeEvaluate, FAKE_MARKERS, FAKE_MODEL_ID, FAKE_PROFILES, type FakeEvaluateArgs } from './fake.ts';
