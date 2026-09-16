// Weekly boss 1, "The ten-record deploy" (ARCHITECTURE.md First 30 Days, Day 7 row and "Bosses, Week 1").
// A template, not a lesson: Gamification 'Bosses' instantiates it as weekly-w<NN> when the learner's week overlaps
// its concepts. Graded with BossRubricSchema; rubricKeyPoints never reach the browser (client-view).
import { boss, defineWeeklyBoss } from '../../../../lib/curriculum/builders.ts';

export const TEN_RECORD_DEPLOY = defineWeeklyBoss({
  id: 'weekly-w1-platform-ten-record-deploy',
  world: 'w1-platform',
  title: 'The ten-record deploy',
  concepts: [
    'relationships.conversion',
    'relationships.lookup-vs-master-detail',
    'ids.15-vs-18',
    'orgs.sandbox-types',
    'orgs.sandbox-preview',
    'platform.releases',
  ],
  exercise: boss({
    id: 'incident',
    concept: 'relationships.conversion',
    dimension: 'debugging',
    depth: 6,
    prompt: {
      caveman: 'A change tested on ten rocks in the practice kitchen broke the real kitchen. Name the culprit, explain why, list what you would look at, propose the fix, and say what it costs.',
      technical: 'Work the incident as the on-call engineer: suspect, why, data needed, what to inspect, solution, trade-offs. Cover every failing symptom, not just the first one.',
    },
    incident: [
      'Monday 09:10. An admin converted Invoice_Line__c.Invoice__c from a lookup to a master-detail relationship in a Developer sandbox last Thursday, tested with ten hand-made Invoice Line records, and deployed the change to production on Friday evening.',
      'Since then three tickets are open:',
      '1. The deployment log shows the relationship change failed on "some records" in production even though it succeeded in the sandbox.',
      '2. The Sales Operations team reports that Invoice Line records can no longer be assigned to their "Billing Review" queue; the Owner field appears locked.',
      '3. Finance built a reconciliation spreadsheet from a report export of Invoice Line IDs and matched it against an API export of the same records; about 40% of rows show as "missing" on one side.',
      'The org is on Summer \'26 (API 67.0). Nobody has touched the sandbox since the deploy. You have 60 minutes before the billing run.',
    ].join('\n\n'),
    rubricKeyPoints: {
      suspect: [
        'Orphan Invoice_Line__c records (Invoice__c null) exist in production but not among the ten sandbox records, so master-detail creation fails there',
        'Detail records lost independent ownership when the relationship became master-detail: Owner is inherited from the Invoice, so queue assignment is no longer possible',
        'The report export carries 15-character IDs and the API export 18-character IDs; a case-insensitive spreadsheet match treats them as different keys',
      ],
      why: [
        'A master-detail relationship requires every detail record to reference a master; the conversion validates existing data and refuses when any record is orphaned',
        'A master-detail child inherits its master\'s owner and sharing; queues, sharing rules and manual sharing are unavailable on the detail side',
        'Reports show the 15-character case-sensitive ID while APIs return the 18-character case-safe form; the values differ textually even though they name the same record',
        'Ten hand-made records in a metadata-only Developer sandbox cannot expose orphan data or ownership patterns that only exist in production volumes',
      ],
      dataNeeded: [
        'Count of Invoice_Line__c rows in production with Invoice__c = null (and how old they are)',
        'The deployment result: which component failed and the exact error message',
        'Which Invoice Line records were queue-owned before the change and which queue',
        'A sample ID from each export to confirm 15 vs 18 characters, and whether the spreadsheet match is case-sensitive',
      ],
      whatToInspect: [
        'Setup > Deployment Status (or the deploy result) for the failing relationship component',
        'Object Manager > Invoice_Line__c > Fields & Relationships: current type of Invoice__c, reparenting and roll-up settings',
        'Sharing Settings and queue configuration for Invoice_Line__c (queues list the objects they support)',
        'The report\'s ID column versus an 18-character API value; CASESAFEID(Id) as a report formula column',
      ],
      solution: [
        'Do not force the conversion: keep the lookup, or first populate Invoice__c on every orphan (a real parent or a documented placeholder Invoice) and then convert',
        'If lines must be queue-owned by the Sales team, master-detail is the wrong relationship; keep a lookup and compute totals with a Flow or Apex instead of a roll-up summary',
        'Reconcile the spreadsheet with CASESAFEID(Id) in the report (or convert both sides to 18 characters) rather than by fixing data',
        'Rehearse the change in a Partial Copy sandbox (sampled real data, 5-day refresh) or the Full sandbox before the next attempt, and deploy through a pipeline, not a Friday-evening change set',
      ],
      tradeOffs: [
        'Master-detail buys roll-up summaries, cascade delete and inherited sharing at the cost of independent ownership, queues and sharing rules on the child',
        'A Partial Copy or Full sandbox rehearsal costs refresh cadence (5 or 29 days) and template maintenance but is the only way to see orphan and ownership patterns',
        'Filling orphans with a placeholder master unblocks the conversion but hides a data-quality problem that finance will meet later',
        'Computing totals in a Flow or Apex instead of a roll-up keeps the lookup but adds automation to maintain and test',
      ],
    },
  }),
  sources: ['help-sandbox-types', 'help-kb-md-conversion', 'help-relationships', 'help-kb-id-15-18', 'help-kb-sandbox-preview'],
  verification: { release: 'summer-26', apiVersion: '67.0', docVersion: "Winter '27 (Latest)", lastVerified: '2026-09-04', status: 'verified' },
});
