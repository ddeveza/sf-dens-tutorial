// defineSource / defineRelease: parse immediately so an authoring mistake in data/sources/*.ts or data/releases.ts
// surfaces at import time with the record id in the message. Re-exported from lib/curriculum/builders.ts.
import { z } from 'zod';
import { ReleaseSchema, SourceSchema } from './schema.ts';
import type { Release, Source } from './types.ts';

export class SourceAuthoringError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = 'SourceAuthoringError';
    this.issues = issues;
  }
}

function parseRecord<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new SourceAuthoringError(`${label}: ${z.prettifyError(result.error)}`, result.error.issues);
  }
  return result.data;
}

function idOf(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') return value.id;
  return '<missing id>';
}

export type SourceInput = z.input<typeof SourceSchema>;
export type ReleaseInput = z.input<typeof ReleaseSchema>;

export function defineSource(input: SourceInput): Source {
  return parseRecord(SourceSchema, input, `source ${idOf(input)}`);
}

export function defineRelease(input: ReleaseInput): Release {
  return parseRecord(ReleaseSchema, input, `release ${idOf(input)}`);
}
