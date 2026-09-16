// Developer documentation sources (tier 'developer', priority 2): every `dev-*` and `pdf-*` row of the
// ARCHITECTURE.md Sources table. PDF ids were `pdf-<topic>` in the research table; the id regex requires the tier
// prefix, so they are `dev-pdf-<topic>` here (all six PDFs are developer-doc PDFs on resources.docs.salesforce.com)
// and carry the `docVersion` the schema demands for `.pdf` urls. data/sources/aliases.ts maps the raw ids.
// developer.salesforce.com returns 403 to automated fetches; `fetchedOk: true` rows were read in a browser session
// on 2026-09-04, `false` rows come from search snippets only and stay `unverified` (§C re-verification workflow).
import { defineSource } from '../../lib/sources/builders.ts';

const RESEARCH_DATE = '2026-09-04';
const fetched = (ok: boolean) =>
  ok ? ({ lastVerified: RESEARCH_DATE, status: 'verified', fetchedOk: true } as const) : ({ lastVerified: null, status: 'unverified', fetchedOk: false } as const);

const W27 = { release: 'winter-27', apiVersion: '68.0' } as const;
const S26 = { release: 'summer-26', apiVersion: '67.0' } as const;
const SP26 = { release: 'spring-26', apiVersion: '66.0' } as const;

const APEX = 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/';
const APEXREF = 'https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/';
const PDF = 'https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/';
const LIMITS = 'https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/';

export const DEVELOPER_SOURCES = [
  defineSource({ id: 'dev-metadata-intro', title: 'Understanding Metadata API (Metadata API Developer Guide)', url: 'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-metadata-zip', title: 'Deploying and Retrieving Metadata with the Zip File (Metadata API Developer Guide)', url: 'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/file_based_zip_file.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-scratch-orgs', title: 'Scratch Orgs (Salesforce DX Developer Guide)', url: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-object-types', title: 'Salesforce Object Types (Object Reference)', url: 'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_concepts_object_types.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-sf-cli', title: 'Salesforce CLI Command Reference (sf)', url: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_unified.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-source-tracking', title: 'Manage Source Tracking for Your Org (Salesforce DX Developer Guide)', url: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_source_tracking_which_orgs.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-apex-ooe', title: 'Triggers and Order of Execution (Apex Developer Guide)', url: `${APEX}apex_triggers_order_of_execution.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-ooe-262', title: "Triggers and Order of Execution (Summer '26, version 262.0)", url: 'https://developer.salesforce.com/docs/atlas.en-us.262.0.apexcode.meta/apexcode/apex_triggers_order_of_execution.htm', tier: 'developer', ...S26, docVersion: 'version 262.0', ...fetched(true) }),
  defineSource({ id: 'dev-apex-ooe-260', title: "Triggers and Order of Execution (Spring '26, version 260.0)", url: 'https://developer.salesforce.com/docs/atlas.en-us.260.0.apexcode.meta/apexcode/apex_triggers_order_of_execution.htm', tier: 'developer', ...SP26, docVersion: 'version 260.0', ...fetched(true) }),
  defineSource({ id: 'dev-ooe-diagram', title: 'Order of Execution (Data Model Gallery diagram)', url: 'https://developer.salesforce.com/docs/platform/data-models/guide/order-of-execution.html', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-apex-gov-limits', title: 'Execution Governors and Limits (Apex Developer Guide)', url: `${APEX}apex_gov_limits.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-gov-limits-262', title: "Execution Governors and Limits (Summer '26, version 262.0)", url: 'https://developer.salesforce.com/docs/atlas.en-us.262.0.apexcode.meta/apexcode/apex_gov_limits.htm', tier: 'developer', ...S26, docVersion: 'version 262.0', ...fetched(true) }),
  defineSource({ id: 'dev-apex-transaction', title: 'Apex Transactions (Apex Developer Guide)', url: `${APEX}apex_transaction.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-transaction-control', title: 'Transaction Control (Apex Developer Guide)', url: `${APEX}langCon_apex_transaction_control.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-limits-class', title: 'Limits Class (Apex Reference Guide)', url: `${APEXREF}apex_methods_system_limits.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-exceptions', title: 'Exception Class and Built-In Exceptions (Apex Reference Guide)', url: `${APEXREF}apex_classes_exception_methods.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-debug-log', title: 'Debug Log (Apex Developer Guide)', url: `${APEX}apex_debugging_debug_log.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-testing-intro', title: 'Understanding Testing in Apex (Apex Developer Guide)', url: `${APEX}apex_testing_intro.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-code-coverage', title: 'Testing and Code Coverage (Apex Developer Guide)', url: `${APEX}apex_code_coverage_intro.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-deploying', title: 'Deploying Apex (Apex Developer Guide)', url: `${APEX}apex_deploying.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-static', title: 'Static and Instance Methods, Variables, and Initialization Code (Apex Developer Guide)', url: `${APEX}apex_classes_static.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-triggers', title: 'Triggers (Apex Developer Guide)', url: `${APEX}apex_triggers.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-trigger-context', title: 'Trigger Context Variables (Apex Developer Guide)', url: `${APEX}apex_triggers_context_variables.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-bulk-idioms', title: 'Common Bulk Trigger Idioms (Apex Developer Guide)', url: `${APEX}apex_triggers_bulk_idioms.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-trigger-bestpract', title: 'Trigger and Bulk Request Best Practices (Apex Developer Guide)', url: `${APEX}apex_triggers_bestpract.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-async-overview', title: 'Asynchronous Apex (Apex Developer Guide)', url: `${APEX}apex_async_overview.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-future', title: 'Future Methods (Apex Developer Guide)', url: `${APEX}apex_invoking_future_methods.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-queueable', title: 'Queueable Apex (Apex Developer Guide)', url: `${APEX}apex_queueing_jobs.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-batch', title: 'Use Batch Apex (Apex Developer Guide)', url: `${APEX}apex_batch_interface.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-scheduler', title: 'Apex Scheduler (Apex Developer Guide)', url: `${APEX}apex_scheduler.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-platform-events-apex', title: 'Subscribe to Platform Event Notifications with Apex Triggers (Platform Events Developer Guide)', url: 'https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_subscribe_apex.htm', tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-pdf-soql-sosl', title: "SOQL and SOSL Reference (PDF, Version 68.0, Winter '27, updated Aug 28, 2026)", url: `${PDF}salesforce_soql_sosl.pdf`, tier: 'developer', ...W27, docVersion: "Version 68.0, Winter '27 (updated Aug 28, 2026)", ...fetched(true) }),
  defineSource({ id: 'dev-pdf-apex-guide', title: 'Apex Developer Guide (PDF, latest)', url: `${PDF}salesforce_apex_developer_guide.pdf`, tier: 'developer', ...W27, docVersion: "latest (Winter '27, API 68.0)", ...fetched(true) }),
  defineSource({ id: 'dev-pdf-limits-quickref', title: 'Salesforce Developer Limits and Allocations Quick Reference (PDF, updated Aug 14, 2026)', url: `${PDF}salesforce_app_limits_cheatsheet.pdf`, tier: 'developer', release: 'winter-27', docVersion: "Winter '27 (updated Aug 14, 2026)", ...fetched(true) }),
  defineSource({ id: 'dev-pdf-ldv', title: "Best Practices for Deployments with Large Data Volumes (PDF, Winter '27, updated July 22, 2026)", url: `${PDF}salesforce_large_data_volumes_bp.pdf`, tier: 'developer', release: 'winter-27', docVersion: "Winter '27 (updated July 22, 2026)", ...fetched(true) }),
  defineSource({ id: 'dev-pdf-data-loader', title: 'Data Loader Guide (PDF)', url: `${PDF}salesforce_data_loader.pdf`, tier: 'developer', docVersion: 'latest (unversioned PDF, fetched 2026-09-04)', ...fetched(true) }),
  defineSource({ id: 'dev-pdf-draes', title: 'Designing Record Access for Enterprise Scale (PDF)', url: `${PDF}draes.pdf`, tier: 'developer', docVersion: 'latest (unversioned PDF, fetched 2026-09-04)', ...fetched(true) }),
  defineSource({ id: 'dev-bulk-api-intro', title: 'Introduction to Bulk API 2.0 and Bulk API (guidance reproduced in dev-pdf-limits-quickref)', url: 'https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/asynch_api_intro.htm', tier: 'developer', ...fetched(false) }),
  defineSource({ id: 'dev-apex-sharing-keywords', title: 'Use the with sharing, without sharing, and inherited sharing Keywords (Apex Developer Guide)', url: `${APEX}apex_classes_keywords_sharing.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-access-mode', title: 'Set an Access Mode for Database Operations (Apex Developer Guide)', url: `${APEX}apex_classes_enforce_usermode.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-enforce-perms', title: 'Enforce Object and Field Permissions (Apex Developer Guide)', url: `${APEX}apex_classes_perms_enforcing.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-apex-strip-inaccessible', title: 'Enforce Security with the stripInaccessible Method (Apex Developer Guide)', url: `${APEX}apex_classes_with_security_stripInaccessible.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-soql-with', title: 'WITH (SOQL and SOSL Reference; page still says "system mode by default", stale wording, cite the release notes over it)', url: 'https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_with.htm', tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-limits-api-requests', title: 'API Request Limits and Allocations (Developer Limits and Allocations Quick Reference)', url: `${LIMITS}salesforce_app_limits_platform_api.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-limits-overview', title: 'About This Quick Reference (Developer Limits and Allocations Quick Reference)', url: `${LIMITS}salesforce_app_limits_overview.htm`, tier: 'developer', ...W27, ...fetched(true) }),
  defineSource({ id: 'dev-platform-event-allocs', title: 'Platform Event Allocations (Platform Events Developer Guide)', url: 'https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_event_limits.htm', tier: 'developer', ...W27, ...fetched(true) }),
];
