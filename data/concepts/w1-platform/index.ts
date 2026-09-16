// World 1 concepts, one file per subtree root (data layout `concepts/<world>/<slug>.ts`; a file holds the root
// concept and its leaves so the knowledge-map path is readable in one place). Explicit imports, no fs globbing.
import type { Concept } from '../../../lib/curriculum/schema.ts';
import { FORMULAS_CONCEPTS } from './formulas.ts';
import { IDS_CONCEPTS } from './ids.ts';
import { LAYOUTS_CONCEPTS } from './layouts.ts';
import { METADATA_API_CONCEPTS } from './metadata-api.ts';
import { ORDER_OF_EXECUTION_CONCEPTS } from './order-of-execution.ts';
import { ORGS_CONCEPTS } from './orgs.ts';
import { PLATFORM_CONCEPTS } from './platform.ts';
import { RELATIONSHIPS_CONCEPTS } from './relationships.ts';
import { SCHEMA_CONCEPTS } from './schema.ts';
import { SF_CLI_CONCEPTS } from './sf-cli.ts';
import { TRANSACTION_CONCEPTS } from './transaction.ts';

export const W1_CONCEPTS: readonly Concept[] = [
  ...PLATFORM_CONCEPTS,
  ...ORGS_CONCEPTS,
  ...IDS_CONCEPTS,
  ...SCHEMA_CONCEPTS,
  ...RELATIONSHIPS_CONCEPTS,
  ...FORMULAS_CONCEPTS,
  ...LAYOUTS_CONCEPTS,
  ...METADATA_API_CONCEPTS,
  ...SF_CLI_CONCEPTS,
  ...TRANSACTION_CONCEPTS,
  ...ORDER_OF_EXECUTION_CONCEPTS,
];
