// Source and release records: the only place URLs, titles and verification dates live. Lessons cite ids.
export const SOURCE_TIERS = ['help', 'developer', 'architect', 'trust_release', 'other'] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const tierPriority: Record<SourceTier, 1 | 2 | 3 | 4 | 5> = {
  help: 1,
  developer: 2,
  architect: 3,
  trust_release: 4,
  other: 5,
};
export const tierPrefix: Record<SourceTier, string> = {
  help: 'help',
  developer: 'dev',
  architect: 'arch',
  trust_release: 'rn',
  other: 'other',
};

export const SOURCE_STATUSES = ['verified', 'unverified', 'documentation_changed', 'stale', 'retired'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number]; // 'stale' is derived, never authored

export type ReleaseId = string; // <season>-<yy>, e.g. 'winter-27'

export interface Source {
  id: string; // ^(help|dev|arch|rn|other)-[a-z0-9-]+$ ; prefix must match tierPrefix[tier]
  title: string;
  url: string;
  tier: SourceTier;
  lastVerified: string | null; // null iff status 'unverified'
  release?: ReleaseId;
  apiVersion?: string;
  docVersion?: string; // required when url ends in .pdf
  status: SourceStatus;
  changeNote?: { since: string; what: string }; // required when status 'documentation_changed'
  fetchedOk?: boolean; // research provenance: false = cited from search snippets, lower confidence
}

export interface Release {
  id: ReleaseId;
  name: string; // "Summer '26"
  apiVersion: string; // "67.0"
  ga: { sandboxPreview: string; productionWeekends: string[] };
  notesUrl: string;
  sourceId: string;
}

export const VERIFICATION_STATUSES = ['verified', 'documentation_changed', 'stale', 'draft'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface Verification {
  release: ReleaseId;
  apiVersion: string;
  docVersion: string;
  lastVerified: string; // YYYY-MM-DD
  status: VerificationStatus;
}

// Ordering used by getLesson().effectiveStatus = worst(...)
export type EffectiveStatus = 'verified' | 'stale' | 'unverified' | 'documentation_changed' | 'retired' | 'draft';
export const EFFECTIVE_STATUS_ORDER: readonly EffectiveStatus[] = [
  'verified',
  'stale',
  'unverified',
  'documentation_changed',
  'retired',
  'draft',
];
