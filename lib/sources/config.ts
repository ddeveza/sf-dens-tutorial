// Source freshness and rendering knobs (ARCHITECTURE.md §C table). Data, never code paths.
import type { SourceTier } from './types.ts';

export const SOURCES_CONFIG = {
  staleAfterDays: 130, // one Salesforce release cycle plus slack; 'stale' is derived from this, never authored
  tierOrder: ['help', 'developer', 'architect', 'trust_release', 'other'] as readonly SourceTier[], // Sources block order
  showChangeNoteMaxChars: 400, // banner truncation of changeNote.what
} as const;

export type SourcesConfig = typeof SOURCES_CONFIG;
