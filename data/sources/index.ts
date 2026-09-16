// Every source record, one file per tier (ARCHITECTURE.md §B data layout `sources/<tier>.ts`). Lessons cite ids
// only; URLs, titles and verification dates live here once. Explicit imports, no fs globbing (plain node).
import type { Source } from '../../lib/sources/types.ts';
import { ARCHITECT_SOURCES } from './architect.ts';
import { DEVELOPER_SOURCES } from './developer.ts';
import { HELP_SOURCES } from './help.ts';
import { OTHER_SOURCES } from './other.ts';
import { TRUST_RELEASE_SOURCES } from './trust-release.ts';

export { RAW_ID_ALIASES, isRawSourceId, resolveSourceId } from './aliases.ts';

export const SOURCES: readonly Source[] = [...HELP_SOURCES, ...DEVELOPER_SOURCES, ...ARCHITECT_SOURCES, ...TRUST_RELEASE_SOURCES, ...OTHER_SOURCES];
