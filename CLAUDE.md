@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Salesforce Depth Quest: a Next.js learning platform for Salesforce *platform depth* (internals, limits, trade-offs, failure modes), not cert memorization. 180-day roadmap across six "worlds", ~1h/day, adaptive mastery with false-understanding detection, RPG-light gamification, LLM-graded teach-backs, email study reminders. The first commit must add `docs/SPEC.md` (the product spec) and `ARCHITECTURE.md`, which owns the data model, learning engine (step machine, probe policy), mastery algorithm, gamification, curriculum architecture (schema, sources, sync), notification design, first-30-days outline, and risks.

## Repo status (2026-09-04)

- Empty directory: no `package.json`, no git, no scaffolding. Everything below is prescriptive.
- `ARCHITECTURE.md` comes before scaffolding; do not skip the design doc.

### Verify once `package.json` exists

- Versions researched 2026-09-04: `next` 16.3.4, `react` 19.2.8, `typescript` ^5 (pinned deliberately: `npm i -D typescript` now resolves to 7.x, which `next build` accepts but typescript-eslint 8.x rejects with peer `<6.1.0`, so lint breaks), `eslint` ^9 (eslint-plugin-import/react/jsx-a11y, pulled in by eslint-config-next, still cap their peer range at 9; do not move to 10 until they declare ^10), `vitest` ^4.1 + `@vitejs/plugin-react` ^5 + `vite` ^7, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.115.0, `@anthropic-ai/sdk` 0.123.0, `resend` 6.26.0, `nodemailer` 9.1.1, `shadcn` 4.20.1.
- Every script in the Commands section must exist under exactly that name.
- `vitest.config.mts`: `defineConfig({ plugins: [tsconfigPaths(), react()], resolve: { alias: { 'server-only': './tests/stubs/server-only.ts' } }, test: { environment: 'jsdom' } })`; `next-env.d.ts` in `.gitignore`; `engines.node >= 24.15.0` with `.nvmrc` at a 24.15+ release (jsdom 30 requires `^24.15.0`); tsconfig `allowImportingTsExtensions: true` (valid because Next uses `noEmit`).
- Update on drift.

## Stack (fixed; do not re-litigate)

| Concern | Decision |
|---|---|
| Framework | Next.js 16 App Router, TypeScript, Turbopack; no `src/`; alias `@/*` -> `./*` |
| Runtime | Node 24 LTS, npm |
| UI | Tailwind v4 + shadcn/ui (`shadcn` package, radix base chosen once at init) |
| DB | Supabase Postgres via `@supabase/supabase-js`; Supabase CLI SQL migrations; generated types; RLS. No Prisma. Drizzle only as a later escape hatch if query complexity demands it. |
| Auth | Supabase Auth via `@supabase/ssr`; publishable/secret keys (not legacy anon/service_role) |
| LLM | `@anthropic-ai/sdk` structured outputs, `claude-opus-5`, free-text evaluation only |
| Email | `EmailProvider` abstraction: `resend` (default) / `smtp` (nodemailer) / `console` |
| Scheduler | Supabase pg_cron hourly -> `GET /api/cron/reminders` (honors per-user preferred time); Vercel Cron daily as catch-up sweep |
| Tests | Vitest 4.x + Testing Library (jsdom); Playwright E2E. Vitest 5 shipped 2026-09-03; upgrade deliberately |
| Deploy | Vercel |

## Commands

Scaffold (once). `create-next-app` aborts on a directory containing `CLAUDE.md` (only `.claude/`, `docs/`, `LICENSE` and dotfiles are tolerated), so move this file aside (or scaffold into a temp dir), run the scaffold, then restore it and merge with the generated `CLAUDE.md`/`AGENTS.md`; `--disable-git` because git is initialised after copy-in. `--yes` makes unspecified options take defaults (React Compiler off, Cache Components off, AGENTS.md on).

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --import-alias "@/*" --use-npm --disable-git --yes
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk zod resend nodemailer server-only
npm install -D supabase vitest@^4.1 @vitejs/plugin-react@^5 vite@^7 jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths @playwright/test @types/nodemailer
npx shadcn@latest init -b radix
npx supabase init
npx playwright install --with-deps chromium
git init
```

Scripts to add to `package.json` (the template provides only dev/build/start/lint):

```json
"lint:fix": "eslint --fix",
"typecheck": "next typegen && tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test",
"db:new": "supabase migration new",
"db:reset": "supabase db reset && npm run curriculum:sync",
"db:types": "supabase gen types --lang typescript --local > types/database.ts",
"db:push": "supabase db push",
"curriculum:sync": "node --env-file=.env.local scripts/sync-curriculum.ts",
"check": "npm run lint && npm run typecheck && npm test"
```

`scripts/**` run under Node's built-in type stripping: plain `node` reads no tsconfig and no `.env.local` (hence `--env-file`), so every file a script imports, transitively (`data/**`, `lib/curriculum/**`, `types/database.ts`, `db/admin.ts`, `lib/env/server.ts`), must use relative specifiers with explicit `.ts` extensions, no `@/` alias, and no `enum` / `namespace` / parameter-property syntax.

Daily (npm needs `--` to forward flags, e.g. `npm run dev -- --webpack`):

```bash
npm run dev                  # Turbopack; writes .next/dev so build can run concurrently
npm run build                # type-checks; does NOT lint
npm run lint                 # eslint directly; next lint no longer exists
npm run typecheck            # tsc alone misses route types; next typegen runs first
npx vitest run lib/mastery-engine                    # files matching a path substring (not a glob)
npx vitest run lib/mastery-engine/caps.test.ts:42    # the single test at a line
npx vitest run -t "recall-only"                      # tests whose full name matches a regexp
```

Database (Docker required):

```bash
npx supabase start                    # API :54321, DB :54322, Studio :54323, Mailpit :54324 (local mail captured, never sent)
npm run db:new -- <name>              # supabase/migrations/<ts>_<name>.sql; hand-write
npx supabase db diff -f <name>        # capture Studio experiments; review (misses some view/publication changes)
npx supabase login && npx supabase link --project-ref <ref>
npx supabase migration list           # local vs remote status
npm run db:push && node --env-file=.env.remote scripts/sync-curriculum.ts   # deploy migrations, then sync the registry remotely
npx supabase stop                     # keeps data (--no-backup wipes)
```

Never run `supabase db reset --linked`; never edit the hosted DB by hand.

Cron locally (neither Vercel nor pg_cron fires in dev):

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

## Environment (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_...
SUPABASE_SECRET_KEY=                    # sb_secret_...; read only by db/admin.ts
NEXT_PUBLIC_SITE_URL=                   # auth redirect base; fallback NEXT_PUBLIC_VERCEL_URL, then http://localhost:3000
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5           # claude-sonnet-5 is the cost step-down
EMAIL_PROVIDER=console                  # resend | smtp | console
EMAIL_FROM=                             # sender on a verified (sub)domain; onboarding@resend.dev only reaches the account owner
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
CRON_SECRET=                            # >= 16 random chars
```

- Local Supabase values come from `npx supabase status -o env`; check whether the CLI still labels them `ANON_KEY`/`SERVICE_ROLE_KEY` before mapping. `.env.remote` (git-ignored) holds the linked project's values for the remote curriculum sync only.
- `lib/env/server.ts` Zod-parses the server-side vars once; import from there. Reference `NEXT_PUBLIC_*` literally as `process.env.NEXT_PUBLIC_...` so Next can inline them.

## Next.js 16 rules (differ from older training data)

- `proxy.ts` at repo root exporting `proxy`, never `middleware.ts`. Node runtime only; no `runtime` export.
- `await cookies()` / `headers()` / `params` / `searchParams`. Page props: `PageProps<'/lesson/[slug]'>` (global helper from `next typegen`, no import).
- `eslint.config.mjs` flat config: `defineConfig([...nextVitals, ...nextTs, globalIgnores([...])])` from `eslint-config-next/core-web-vitals` and `/typescript`. No `.eslintrc`.
- `cacheComponents` stays off (decided). Learner pages are dynamic (they read cookies), so there is nothing to tag: after a Server Action return the new state, `revalidatePath()` or `redirect()`. Tags matter only if `'use cache'`/`unstable_cache` is later adopted for curriculum reads.
- No `webpack` key in `next.config.ts` (build fails); Turbopack options go under `turbopack: {}`.
- `create-next-app` generates `AGENTS.md` plus a `CLAUDE.md` that references it; keep this file as the source of truth and merge, never overwrite.

## Architecture

### Layout (prune this once scaffolded)

```
app/            auth/{login,confirm,callback}  (app)/{dashboard,learn,world,lesson,boss,review,progress,settings}  api/cron/reminders
lib/            env/ supabase/ curriculum/ learning-engine/ mastery-engine/ spaced-repetition/ gamification/ assessments/ simulations/ llm/ notifications/ sources/
db/             queries/ (the only place .from() is called)  admin.ts (secret-key client)
data/           curriculum/ lessons/ challenges/ sources/   typed TS content
scripts/        sync-curriculum.ts (node type stripping; constraints under Commands)
tests/          e2e/ (Playwright)  stubs/server-only.ts (Vitest alias target)
types/          database.ts (generated, never edit)
proxy.ts  vercel.json  eslint.config.mjs  vitest.config.mts
```

`'use client'` only for interactive leaves: lesson steps, predict/reveal, caveman toggle, answer inputs, simulators, charts.

### Auth boundary

- `lib/supabase/client.ts`: `createBrowserClient`, auth UI only.
- `lib/supabase/server.ts`: `createServerClient` with `getAll`/`setAll` over `await cookies()`; the `setAll` try/catch is intentional. New instance per call, never module-level.
- `lib/supabase/proxy.ts` (`updateSession`): create client, call `supabase.auth.getClaims()` immediately, return the same response object. Redirect to `/auth/login` only when `pathname !== '/' && !claims && !pathname.startsWith('/auth') && !pathname.startsWith('/api/cron')` (the with-supabase example's public-path exemption; without it the login page redirects to itself and the cookie-less cron GET gets a 307 that cron callers never follow). Root `proxy.ts` matcher: `"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"`.
- The proxy is not an authorization boundary (Server Actions are POSTs to the page route): every Server Action and Route Handler calls `getClaims()` itself and takes `user_id` from claims, never from input. Never `getSession()` on the server; `getUser()` only when fresh data matters. Enable asymmetric JWT signing keys so `getClaims()` verifies locally.
- `app/api/cron/**` is authenticated solely by `CRON_SECRET` and must never depend on session cookies.
- `app/auth/confirm/route.ts` (`token_hash` -> `verifyOtp`) and `app/auth/callback/route.ts` (`code` -> `exchangeCodeForSession`, OAuth). The magic-link template must link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`: hosted, in the dashboard; local, `supabase/templates/magic_link.html` via `[auth.email.template.magic_link] content_path` in `config.toml`, plus `site_url`/`additional_redirect_urls` for localhost. Register `http://localhost:3000/**`, `https://*-<team-slug>.vercel.app/**` and prod under Auth > Redirect URLs.
- Every `public` table gets `enable row level security` in the migration that creates it; policies `to authenticated using ((select auth.uid()) = user_id)` (`with check` for insert/update) plus an index on `user_id`. Curriculum registry tables are select-only for `authenticated`.
- `db/admin.ts` (secret key, bypasses RLS) may be imported only from `app/api/cron/**` and `scripts/**`; add an ESLint `no-restricted-imports` rule for it at scaffold time. `lib/supabase/server.ts` and `lib/llm/*` start with `import 'server-only'`; `db/admin.ts` and `lib/env/server.ts` deliberately do not, because `server-only` throws under plain `node` (scripts) and under Vitest (hence the stub alias).

### Data flow: one attempt

```
lesson data (data/) -> lib/curriculum loader -> Server Component page -> Client answer widget
  -> Server Action submitAttempt(input)      getClaims(), Zod-parse, check_llm_quota
  -> lib/assessments       deterministic scorers; lib/llm for free text
  -> lib/mastery-engine    applyEvaluation: dimension scores, band, confidence, probe request
  -> lib/gamification      XP transaction, streak, achievements
  -> lib/spaced-repetition next review date
  -> db.rpc('record_attempt', payload)       one Postgres function = one transaction
  -> redirect() / revalidatePath()
```

- Pure engines: `lib/{learning-engine,mastery-engine,spaced-repetition,gamification,assessments}`, `lib/simulations/{governor-limits,order-of-execution,sharing,soql-selectivity}` (`components/simulations` only renders) and `lib/notifications/scheduler.ts`. Plain objects in/out; no IO, no env, no `next/*` or supabase imports, no `Date.now()` (callers pass `now`; never mock the clock). Unit tests are required for them before the UI that uses them.
- `record_attempt` is defined in a migration with a test and is `security invoker` (RLS applies); if it ever becomes `security definer` it derives `user_id` from `auth.uid()` and ignores any id in the payload. `revoke execute ... from public, anon; grant execute ... to authenticated`.
- DB holds the curriculum registry (world/mission/lesson/concept slugs, ordering, release) plus all learner state; lesson bodies stay in `data/` keyed by the same slug and `npm run curriculum:sync` upserts the registry. Constraints carry invariants: unique `(user_id, concept_id)` on `mastery`, `check` 0-100 on scores, unique `(user_id, kind, local_date)` on `notification_log`.
- Attempts store `duration_ms`, optional `self_confidence` (1-5) and `misconception_ids[]`; repeated mistakes = misconceptions seen twice or more (derived, never a counter).
- Rate limits are server-side: per-user LLM quota in `llm_usage(user_id, hour_bucket, count)`, checked by the `check_llm_quota` SQL function before any Claude call and incremented by `record_attempt`; a cap on `pending_evaluation` retries; a generic Server Action limit on the same table (or Vercel WAF). Limits live in `lib/llm/config.ts`. Exceeded => `nextAction: 'retry_later'`, no LLM call.

### Engines (learning, mastery, spaced repetition, gamification)

- Lesson step machine (`lib/learning-engine`): Curiosity -> Problem -> Caveman -> Technical -> Simulation -> Prediction (captured before reveal) -> Hands-on -> Teach-back -> Assessment -> Spaced review -> Real-world scenario. Segment budgets for a 60-minute day: warm-up 5 (1-3 questions from due review items plus one boss-style question) / learn 10 / deep dive 15 / lab 15 / challenge 10 (answer revealed only after an attempt) / teach-back 5. Learners advance as soon as mastery is demonstrated; never pad to 60 minutes.
- `lib/learning-engine` also owns next-action selection (enum in ARCHITECTURE.md), probe selection after a suspicious answer, and difficulty from mastery.
- Per concept six dimensions (Recall / Understanding / Application / Debugging / Architecture / Teach-back), 0-100 each -> weighted overall -> band. Band thresholds, weights, caps, the depth scale (1-8) and probe angles live in `lib/mastery-engine/config.ts` (values in ARCHITECTURE.md), never inline.
- Hard caps are rules, not weights: recall-only evidence cannot lift overall above Familiar; Competent+ requires understanding evidence; Mastered requires teach-back plus application-or-debugging evidence at depth >= 5. Every exercise is tagged with `depth` and `dimension`; the engine reads the tags.
- A correct recall answer at or above the concept's current band triggers an LLM-graded explain-why probe before any delta is credited. Correct answer + weak explanation => `{ answer: 'correct', understanding: 'weak', confidence: 'suspicious' }`, ~zero delta, and a mandatory different-angle probe. Repeating an identical question form adds no mastery.
- Spaced repetition: intervals in config; review questions come from weak dimensions at a different angle; review debt = overdue count.
- Gamification: XP is written only as `xp_transactions` rows with a `reason` enum; level, title and the six skill bars are derived, never stored counters. Explained-correct always earns more than MCQ-correct. Streak = one qualifying activity per calendar day in the user's time zone.
- Bosses: a boss battle closes every mission/topic and a weekly boss fires every 7 calendar days over that week's concepts; both are production-incident scenarios graded with `BossRubricSchema` (suspect, why, data needed, what to inspect, solution, trade-offs: each 0-100, plus overall and `misconceptions[]`). The Day-180 capstone uses `CapstoneSchema` with 12 dimensions (Platform Knowledge, Data Architecture, Security, Apex, Automation, Integration, Scalability, Performance, Reliability, Observability, Trade-off Reasoning, Communication). `bosses_defeated`, `architecture_score` and `debugging_score` are derived from these rows, never stored.

### LLM boundary (`lib/llm`)

- Only free-text answers (explain-why, teach-back, architecture, scenario, boss, capstone) reach Claude; every selection, prediction, ordering and code-inspection type is scored deterministically in `lib/assessments` with no network call. The full type split is in ARCHITECTURE.md.
- `client.messages.parse({ model, max_tokens: 16000, messages, output_config: { effort, format: zodOutputFormat(schema) } })` with `EvaluationSchema` (lessons: `correctness, understanding, application, architecture, confidence, masteryDelta, misconceptions[], nextAction`), `BossRubricSchema` or `CapstoneSchema`; every object `additionalProperties: false`. No prefill (400 on all current models); do not force `tool_choice` for JSON either (400 on claude-fable-5-1, unnecessary with `output_config.format`). Never lowball `max_tokens`: truncation is a failed evaluation.
- Output is evidence, not authority. `applyEvaluation({ mastery, evaluation, questionType, now, config })` clamps `masteryDelta` to `config.maxDelta[questionType]`, discards a positive delta when `correctness` is below threshold, accepts `nextAction` only from the enum `learning-engine` supports, and appends `misconceptions[]` to weak areas.
- `parsed_output == null` or `stop_reason !== 'end_turn'` is a failure: the attempt is stored as `pending_evaluation` with zero mastery change and retried later (bounded by the retry cap); the lesson never blocks on it. Raw LLM JSON lives in `attempts.llm_evaluation` (jsonb); the applied delta is stored separately.
- Rubric and schema first, learner text last (prompt cache). The grading default `output_config.effort` lives in `lib/llm/config.ts`; tune it before switching models.

### Curriculum

- Lessons are data, not pages: `data/lessons/<world>/<day>.ts` conforming to `LessonSchema` in `lib/curriculum/schema.ts` (field list in ARCHITECTURE.md). Required blocks: `explanation.caveman` + `explanation.technical`, `deepDive { when, whenNot, whatBreaks, scale: { at1M, at10M }, limits, security, performance }`, exercises tagged `depth`/`dimension`, sources, and `verification { release, apiVersion, docVersion, lastVerified, status }`. Every significant concept ships a best practice and an anti-pattern record. Caveman text uses no Salesforce jargon before the reveal step and may not contradict the technical section.
- Author with builders (`defineLesson`, `defineConcept`, `mcq()`, `predict()`, `teachBack()`), never copy-paste days. `curriculum.test.ts` Zod-validates every lesson and asserts every referenced concept/source/question exists: referential integrity for content lives in tests, not FKs. Pages read content through `lib/curriculum` loaders (`getWorld`, `getLesson`, `getConceptTree`), never `data/` directly.
- `lib/sources` owns source records (id, title, url, tier, lastVerified, release, apiVersion, docVersion); lessons reference ids. When a source's documented behavior changes, mark the source `documentationChanged` so every lesson citing it renders `verification.status = 'documentation_changed'`; never silently rewrite a verified lesson; bump `lastVerified` only after re-checking the source.

### Notifications

- `lib/notifications/`: `scheduler.ts` (`selectDue(now, users)` picks users whose preferred hour in their time zone equals the current hour and who have no `notification_log` row for that local day), `providers/{resend,smtp,console}.ts` implementing `EmailProvider.send()`, `index.ts` picks by `EMAIL_PROVIDER`. Resend returns `{ error }` instead of throwing; check it. Provider limits (Resend free: 100/day, 3000/month; Supabase built-in auth mail: 2/hour, so use custom SMTP) live in `limits.ts` as data, never as code paths.
- `app/api/cron/reminders/route.ts`: `GET`, 401 unless `authorization === Bearer ${CRON_SECRET}`, `export const maxDuration = 300`, admin client, reads preferences (fields in ARCHITECTURE.md). Idempotent: insert the unique `notification_log` row first and send only when the insert succeeded, because callers may skip or double-fire and never retry.
- Scheduling (decided): Supabase pg_cron invokes the route hourly, `select cron.schedule('reminders-hourly', '0 * * * *', $$ select net.http_post(url:='<site>/api/cron/reminders', headers:=jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')), timeout_milliseconds:=5000) $$)`, so preferred study time is honored to the hour. `vercel.json` `{ "crons": [{ "path": "/api/cron/reminders", "schedule": "0 13 * * *" }] }` is the daily catch-up sweep (Hobby allows once per day, fires within the hour, UTC). Open item: pg_cron on the Free plan is unverified, and the 7-day idle pause stops it (the app is down anyway when paused).

### Commercial readiness (kept open, not built)

- The MVP serves one learner, but no code may assume it: every learner table is keyed by `user_id`, no hardcoded identity, no singleton "the user" in config or queries.
- LLM spend is the margin lever. Model per question class (boss/capstone vs daily probe vs cheap check) and per-plan quotas live in `lib/llm/config.ts` and `check_llm_quota`; a `plan` column on `profiles` (default `personal`) is the only tier hook today.
- Additive later, never retrofitted: `organizations` + `memberships` (RLS extends with an `exists (select 1 from memberships ...)` clause), billing, team knowledge-map views, hiring-assessment export of boss/capstone rubric rows.
- Independent product: never "Salesforce" as the product name or implied endorsement; link official docs, never copy them.

## Workflow

- Build order: 1 Foundation -> 2 Learning engine -> 3 Game -> 4 Adaptive -> 5 Simulations (governor limits, order of execution, sharing, SOQL selectivity) -> 6 Notifications -> 7 Curriculum. Author days 1-10 only until Phases 1-4 are validated; Phase 7 fills 180 with reusable structures.
- Research current official Salesforce docs (Help > Developer docs > Architect docs > Trust / release notes) before authoring any lesson; record release/API version.
- Feature done = `npm run check` green + dashboard -> lesson -> answer -> mastery change visible in the browser. Async Server Component pages are covered by Playwright (`npm run e2e`), not Vitest.
- A schema change means a new migration + `npm run db:reset` + `npm run db:types` in the same change; commit `types/database.ts`.
