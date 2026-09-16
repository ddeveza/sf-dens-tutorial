// Verification propagation (ARCHITECTURE.md §C). Pure: the caller passes `today` (YYYY-MM-DD); nothing is stored.
// effectiveStatus = worst(lesson.verification.status, ...citedSources) with ordering
// verified < stale < unverified < documentation_changed < retired < draft; 'stale' is derived from staleAfterDays.
import { SOURCES_CONFIG } from '../sources/config.ts';
import type { SourcesConfig } from '../sources/config.ts';
import { EFFECTIVE_STATUS_ORDER } from '../sources/types.ts';
import type { EffectiveStatus, Source, Verification } from '../sources/types.ts';
import { getSource } from '../sources/index.ts';
import { isValidIsoDate } from './schema.ts';

export interface ChangeNoteView {
  sourceId: string;
  title: string;
  url: string;
  since: string;
  what: string; // truncated to config.showChangeNoteMaxChars
}

export interface EffectiveVerification {
  status: EffectiveStatus;
  lessonStatus: EffectiveStatus; // the lesson's own contribution (after stale derivation)
  sourceStatuses: Array<{ sourceId: string; status: EffectiveStatus }>;
  changeNotes: ChangeNoteView[]; // documentation_changed sources still newer than the lesson's lastVerified
  missingSourceIds: string[]; // cited ids absent from the registry (ranked 'unverified')
}

/**
 * What getLesson() exposes: the authored verification block untouched (`status` stays the author's word) plus the
 * derived `effectiveStatus` and the evidence behind it. Its own interface, not `Verification & EffectiveVerification`:
 * the two `status` fields have different domains (authored VerificationStatus vs derived EffectiveStatus).
 */
export interface LessonVerificationView extends Verification {
  effectiveStatus: EffectiveStatus;
  lessonStatus: EffectiveStatus;
  sourceStatuses: EffectiveVerification['sourceStatuses'];
  changeNotes: ChangeNoteView[];
  missingSourceIds: string[];
}

type Verifiable = { verification: Pick<Verification, 'status' | 'lastVerified'>; sources: readonly string[] };
type SourceLookup = readonly Source[] | ReadonlyMap<string, Source>;

export function rankStatus(status: EffectiveStatus): number {
  return EFFECTIVE_STATUS_ORDER.indexOf(status);
}

export function worstStatus(first: EffectiveStatus, ...rest: EffectiveStatus[]): EffectiveStatus {
  return rest.reduce((worst, status) => (rankStatus(status) > rankStatus(worst) ? status : worst), first);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD, UTC); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function isStale(lastVerified: string, today: string, config: SourcesConfig = SOURCES_CONFIG): boolean {
  return daysBetween(lastVerified, today) > config.staleAfterDays;
}

/** The lesson's own status: `verified` becomes `stale` past staleAfterDays; a future or invalid date is `draft`. */
export function lessonOwnStatus(verification: Pick<Verification, 'status' | 'lastVerified'>, today: string, config: SourcesConfig = SOURCES_CONFIG): EffectiveStatus {
  if (!isValidIsoDate(verification.lastVerified) || verification.lastVerified > today) return 'draft';
  if (verification.status === 'verified' && isStale(verification.lastVerified, today, config)) return 'stale';
  return verification.status;
}

/**
 * A source's status as seen by one lesson. A `documentation_changed` source counts as `verified` for a lesson whose
 * `lastVerified` is strictly newer than `changeNote.since`; `verified` becomes `stale` past staleAfterDays.
 */
export function effectiveSourceStatus(
  source: Pick<Source, 'status' | 'lastVerified' | 'changeNote'>,
  lessonLastVerified: string,
  today: string,
  config: SourcesConfig = SOURCES_CONFIG,
): EffectiveStatus {
  let status: EffectiveStatus = source.status;
  if (status === 'documentation_changed' && source.changeNote && lessonLastVerified > source.changeNote.since) status = 'verified';
  if (status === 'verified' && source.lastVerified !== null && isStale(source.lastVerified, today, config)) status = 'stale';
  return status;
}

export function truncateChangeNote(what: string, maxChars: number = SOURCES_CONFIG.showChangeNoteMaxChars): string {
  if (what.length <= maxChars) return what;
  return `${what.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function effectiveVerification(lesson: Verifiable, sources: SourceLookup, today: string, config: SourcesConfig = SOURCES_CONFIG): EffectiveVerification {
  const lessonStatus = lessonOwnStatus(lesson.verification, today, config);
  const sourceStatuses: EffectiveVerification['sourceStatuses'] = [];
  const changeNotes: ChangeNoteView[] = [];
  const missingSourceIds: string[] = [];

  for (const sourceId of lesson.sources) {
    const source = getSource(sources, sourceId);
    if (!source) {
      missingSourceIds.push(sourceId);
      sourceStatuses.push({ sourceId, status: 'unverified' });
      continue;
    }
    const status = effectiveSourceStatus(source, lesson.verification.lastVerified, today, config);
    sourceStatuses.push({ sourceId, status });
    if (status === 'documentation_changed' && source.changeNote) {
      changeNotes.push({
        sourceId,
        title: source.title,
        url: source.url,
        since: source.changeNote.since,
        what: truncateChangeNote(source.changeNote.what, config.showChangeNoteMaxChars),
      });
    }
  }

  const status = worstStatus(lessonStatus, ...sourceStatuses.map((entry) => entry.status));
  return { status, lessonStatus, sourceStatuses, changeNotes, missingSourceIds };
}

/** `worst(lesson.verification.status, ...citedSources)` after stale derivation and the changeNote.since rule. */
export function effectiveStatus(lesson: Verifiable, sources: SourceLookup, today: string, config: SourcesConfig = SOURCES_CONFIG): EffectiveStatus {
  return effectiveVerification(lesson, sources, today, config).status;
}

/** The authored block plus `effectiveStatus` and its evidence; what LessonView.verification carries. */
export function lessonVerificationView(
  lesson: { verification: Verification; sources: readonly string[] },
  sources: SourceLookup,
  today: string,
  config: SourcesConfig = SOURCES_CONFIG,
): LessonVerificationView {
  const effective = effectiveVerification(lesson, sources, today, config);
  return {
    ...lesson.verification,
    effectiveStatus: effective.status,
    lessonStatus: effective.lessonStatus,
    sourceStatuses: effective.sourceStatuses,
    changeNotes: effective.changeNotes,
    missingSourceIds: effective.missingSourceIds,
  };
}
