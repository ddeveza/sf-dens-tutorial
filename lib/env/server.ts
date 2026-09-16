// Server-side environment, Zod-parsed once (CLAUDE.md "Environment"). Deliberately NO 'server-only' import:
// scripts/** run this under plain node and Vitest imports it directly, and `server-only` throws in both.
// Relative `.ts` specifiers for the same reason. NEXT_PUBLIC_* vars are referenced literally as
// process.env.NEXT_PUBLIC_... so Next can inline them; they are not part of the parsed object.
import { z } from 'zod';
import { DEFAULT_LLM_MODEL, LLM_EFFORTS, LLM_MODEL_IDS } from '../llm/config.ts';

export const LLM_MODES = ['fake', 'live'] as const;
export type LlmMode = (typeof LLM_MODES)[number];

export const EMAIL_PROVIDERS = ['resend', 'smtp', 'console'] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

const CRON_SECRET_MIN_LENGTH = 16;
const DEFAULT_SMTP_PORT = 587;
const MAX_PORT = 65535;
const LOCAL_SITE_URL = 'http://localhost:3000';

const ModelId = z.enum(LLM_MODEL_IDS);
const Effort = z.enum(LLM_EFFORTS);
const Secret = z.string().min(1);

const ServerEnvObject = z
  .object({
    /** Read only by db/admin.ts (bypasses RLS). */
    SUPABASE_SECRET_KEY: Secret,

    ANTHROPIC_API_KEY: Secret.optional(),
    ANTHROPIC_MODEL: ModelId.default(DEFAULT_LLM_MODEL),
    /** `fake` swaps lib/llm/client.ts for the canned responder; no API key needed. */
    LLM_MODE: z.enum(LLM_MODES).default('live'),
    /** Per-class routing overrides (ARCHITECTURE.md LLM §A); an unknown id fails boot, never a silent fallback. */
    LLM_MODEL_CHECK: ModelId.optional(),
    LLM_MODEL_PROBE: ModelId.optional(),
    LLM_MODEL_BOSS: ModelId.optional(),
    LLM_MODEL_CAPSTONE: ModelId.optional(),
    LLM_EFFORT_CHECK: Effort.optional(),
    LLM_EFFORT_PROBE: Effort.optional(),
    LLM_EFFORT_BOSS: Effort.optional(),
    LLM_EFFORT_CAPSTONE: Effort.optional(),
    /** Simulated grading latency for the fake responder (Playwright pending-state checks). */
    FAKE_LLM_LATENCY_MS: z.coerce.number().int().min(0).default(0),

    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).default('console'),
    /** Sender on a verified (sub)domain; may be `Name <addr>`. */
    EMAIL_FROM: Secret.optional(),
    RESEND_API_KEY: Secret.optional(),
    SMTP_HOST: Secret.optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_SMTP_PORT),
    SMTP_USER: Secret.optional(),
    SMTP_PASS: Secret.optional(),

    /** Sole authentication for app/api/cron/**. */
    CRON_SECRET: z.string().min(CRON_SECRET_MIN_LENGTH),
  });

export type ServerEnv = z.infer<typeof ServerEnvObject>;
export type EnvSource = Record<string, string | undefined>;

type EnvKey = keyof ServerEnv;

/**
 * Conditional requirements, checked against the cleaned source rather than inside a `superRefine` so they are
 * reported together with the per-key issues (zod skips refinements once a required key is missing).
 */
function crossFieldIssues(clean: Record<string, string>): z.ZodIssue[] {
  const issues: z.ZodIssue[] = [];
  const need = (key: EnvKey, why: string) => {
    if (clean[key] === undefined) {
      issues.push({ code: 'custom', path: [key], message: `${key} is required ${why}`, input: undefined });
    }
  };
  const mode = clean.LLM_MODE ?? 'live';
  const provider = clean.EMAIL_PROVIDER ?? 'console';
  if (mode === 'live') need('ANTHROPIC_API_KEY', 'when LLM_MODE=live');
  if (provider === 'resend') {
    need('RESEND_API_KEY', 'when EMAIL_PROVIDER=resend');
    need('EMAIL_FROM', 'when EMAIL_PROVIDER=resend');
  }
  if (provider === 'smtp') {
    need('SMTP_HOST', 'when EMAIL_PROVIDER=smtp');
    need('SMTP_USER', 'when EMAIL_PROVIDER=smtp');
    need('SMTP_PASS', 'when EMAIL_PROVIDER=smtp');
    need('EMAIL_FROM', 'when EMAIL_PROVIDER=smtp');
  }
  return issues;
}

/** `KEY=` lines in .env files arrive as empty strings; treat blank as unset so defaults and optionals apply. */
function withoutBlanks(source: EnvSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim();
  }
  return out;
}

/** Pure parse of an arbitrary source; throws one Error listing every problem. */
export function parseServerEnv(source: EnvSource): ServerEnv {
  const clean = withoutBlanks(source);
  const result = ServerEnvObject.safeParse(clean);
  const issues = [...(result.success ? [] : result.error.issues), ...crossFieldIssues(clean)];
  if (!result.success || issues.length > 0) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(new z.ZodError(issues))}`);
  }
  return result.data;
}

let cached: ServerEnv | null = null;

/** Memoized parse of process.env; the first bad boot throws here, never at a later request. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Tests only: drop the memoized value so the next getServerEnv() re-reads process.env. */
export function resetServerEnvCache(): void {
  cached = null;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Auth redirect base: NEXT_PUBLIC_SITE_URL -> https://NEXT_PUBLIC_VERCEL_URL -> http://localhost:3000. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercel) return `https://${stripTrailingSlash(vercel.replace(/^https?:\/\//, ''))}`;
  return LOCAL_SITE_URL;
}
