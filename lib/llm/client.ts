// The only file that talks to the Claude API (ARCHITECTURE.md LLM §A). Structured outputs via
// `output_config: { effort, format: zodOutputFormat(schema) }`, no prefill, no forced tool_choice; the capstone
// class streams (`messages.stream(...).finalMessage()`) because its max_tokens is high.
//
// Why `messages.create` + the helper's own `parse` instead of `messages.parse`: the SDK's parse() throws an
// AnthropicError on invalid or truncated JSON before stop_reason can be inspected, which would report every
// max_tokens truncation as parse_null. The wire request is byte-identical; only the failure classification differs.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { getServerEnv } from '../env/server.ts';
import { routeFor } from './config.ts';
import { fakeEvaluate } from './fake.ts';
import type { EvaluateArgs, EvaluateFailure, EvaluateFailureReason, EvaluateResult, EvaluateUsage } from './types.ts';

let anthropic: Anthropic | null = null;

/** Memoized SDK client. With LLM_MODE=fake nothing calls this; an undefined key defers to the SDK's own resolution. */
export function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: getServerEnv().ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function fail(reason: EvaluateFailureReason, detail: string): EvaluateFailure {
  return { ok: false, reason, detail };
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `${error.name}${error.status === undefined ? '' : ` ${error.status}`}: ${error.message}`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function toUsage(usage: Anthropic.Usage): EvaluateUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

/** stop_reason first (refusal / truncation are not parse errors), then the first text block through the schema parser. */
function interpret<T>(message: Anthropic.Message, parse: (content: string) => T): EvaluateResult<T> {
  if (message.stop_reason === 'refusal') {
    const details = message.stop_details;
    return fail('refusal', details?.explanation ?? details?.category ?? 'refusal');
  }
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
    return fail('truncated', `stop_reason=${message.stop_reason}`);
  }
  if (message.stop_reason !== 'end_turn') {
    return fail('error', `unexpected stop_reason=${String(message.stop_reason)}`);
  }
  const text = message.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) return fail('parse_null', 'no text block in response');
  try {
    return { ok: true, output: parse(text), model: message.model, usage: toUsage(message.usage) };
  } catch (error) {
    return fail('parse_null', describeError(error));
  }
}

export async function evaluate<TSchema extends z.ZodType>(
  args: EvaluateArgs<TSchema>,
): Promise<EvaluateResult<z.infer<TSchema>>> {
  const env = getServerEnv();
  if (env.LLM_MODE === 'fake') {
    return fakeEvaluate({ ...args, latencyMs: env.FAKE_LLM_LATENCY_MS });
  }

  const route = routeFor(args.class, env);
  const { parse, ...format } = zodOutputFormat(args.schema);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: route.model,
    max_tokens: route.maxTokens,
    system: args.system,
    messages: args.messages,
    output_config: { effort: route.effort, format },
  };

  let message: Anthropic.Message;
  try {
    const client = getAnthropic();
    message = route.stream ? await client.messages.stream(params).finalMessage() : await client.messages.create(params);
  } catch (error) {
    // 4xx/5xx/timeouts after the SDK's own retries: the attempt is stored as pending_evaluation and drained later.
    return fail('error', describeError(error));
  }
  return interpret(message, parse);
}
