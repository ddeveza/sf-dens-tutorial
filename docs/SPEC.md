# Claude Code Prompt — Salesforce Depth Quest

## Mission

Build a production-quality **Next.js interactive learning platform** that helps me master Salesforce **platform depth**, not memorize certification facts.

The application should feel like a **game + personal coach + technical laboratory**.

My target is a **Day 1 → Day 180 Salesforce Platform Depth Quest**, normally **1 hour per day**. I may finish early and move ahead when I demonstrate mastery. The system must never force me to spend exactly one hour if I have already mastered the day's objectives.

The core philosophy is:

> **Understand the machine. Don't memorize the buttons.**

I want to understand:
- Why Salesforce behaves the way it does
- What happens internally
- Trade-offs
- Limits and governor behavior
- Architecture decisions
- Best practices
- Anti-patterns
- Failure modes
- Performance implications
- Security implications
- Data-volume implications
- How features interact with one another
- How to diagnose real production problems

Use **Caveman-style explanations** whenever introducing difficult concepts:
- Simple words
- Concrete analogies
- "Caveman sees..." explanations
- Then progressively reveal the real Salesforce terminology
- Never sacrifice technical correctness for simplicity

---

# 1. First: Understand My Existing Roadmap

I previously created a Salesforce Platform Depth roadmap with these broad phases:

### Days 1–30 — Platform Fundamentals
Deep understanding of Salesforce's platform model, metadata, execution model, transactions, limits, data model, and core platform behavior.

### Days 31–60 — Data Architecture & Large Data Volume
Data modeling, indexing, selectivity, query optimization, LDV, skinny tables, data skew, sharing calculations, archiving, and performance.

### Days 61–90 — Security & Sharing
Org-wide defaults, roles, sharing rules, manual sharing, teams, Apex managed sharing, restriction/scoping concepts, CRUD/FLS, user permissions, security enforcement, and how access is actually calculated.

### Days 91–120 — Apex & Automation
Apex execution, triggers, Flow, order of execution, asynchronous Apex, governor limits, bulkification, transactions, savepoints, recursion, platform events, and automation architecture.

### Days 121–150 — Integration & Events
REST/SOAP, OAuth, Named Credentials, External Credentials, callouts, Platform Events, Change Data Capture, Pub/Sub concepts, retries, idempotency, integration patterns, limits, and failure handling.

### Days 151–180 — Architecture & Mastery
System design, trade-offs, real-world scenarios, troubleshooting, performance, scalability, security, integration architecture, and architecture-level decision making.

The final phase should culminate in difficult real-world architecture challenges rather than a normal quiz.

---

# 2. Learning Philosophy

Every lesson must optimize for **retention and understanding**.

Do NOT build a traditional LMS that is mostly:
- Long articles
- Multiple-choice quizzes
- Flashcards
- Certification dumps
- Memorization

Instead, use:

1. **Curiosity**
2. **Problem**
3. **Caveman explanation**
4. **Technical explanation**
5. **Interactive simulation**
6. **Prediction**
7. **Hands-on challenge**
8. **Teach-back**
9. **Assessment**
10. **Spaced review**
11. **Real-world scenario**

The learner should frequently have to answer:

> "What do you think Salesforce will do?"

before revealing the answer.

This is important because prediction exposes misunderstandings better than passive reading.

---

# 3. Daily 1-Hour Study Loop

Design each day around approximately 60 minutes.

Suggested structure:

### 0–5 min — Warm-up
- Review previous knowledge
- 1–3 quick questions
- Show current XP/streak/progress
- One "Boss Question"

### 5–15 min — Learn
Explain today's concept using:
- Caveman explanation
- Real Salesforce terminology
- Why it exists
- Mental model

### 15–30 min — Deep Dive
Show:
- Internal behavior
- Execution flow
- Limits
- Edge cases
- Interactions with other Salesforce features
- Best practice
- Anti-pattern

### 30–45 min — Interactive Lab
The user must manipulate or reason about something.

Examples:
- Predict order of execution
- Choose an index
- Diagnose a SOQL problem
- Fix a trigger
- Design sharing
- Select an integration pattern
- Identify governor-limit failure
- Debug a transaction

### 45–55 min — Challenge
Give a realistic production scenario.

Example:

> "A customer has 20 million Account records. A report became slow after a sharing-rule change. What would you investigate first?"

Do not immediately reveal the answer.

### 55–60 min — Teach Back
Ask:

> "Explain this to a junior developer in your own words."

Evaluate the response.

If I demonstrate mastery, allow me to continue to the next lesson/day.

---

# 4. Adaptive Learning

Do NOT treat Day 1–180 as a rigid schedule.

Each learning goal should have a mastery score.

For example:

```text
Concept: Salesforce Transaction Model

Understanding:      92%
Application:        84%
Troubleshooting:    71%
Architecture:       60%
Teach-back:         88%

Overall Mastery:    79%
```

Use different mastery dimensions:

- Recall
- Understanding
- Application
- Debugging
- Architecture
- Teach-back

A learner should NOT be marked "mastered" just because they answered multiple-choice questions correctly.

Suggested mastery levels:

```text
0–39   Lost
40–59  Familiar
60–74  Developing
75–84  Competent
85–94  Strong
95–100 Mastered
```

Allow configurable mastery thresholds.

---

# 5. Detect False Understanding

This is extremely important.

The system must identify when I am guessing.

Examples:

I answer a question correctly but cannot explain WHY.

Mark:

```text
Answer: Correct
Understanding: Weak
Confidence: Suspicious
```

Then generate a different question testing the same concept from another angle.

Use:
- "Why?"
- "What happens if..."
- "What would break?"
- "What would you change?"
- "Explain it without Salesforce terminology."
- "Explain it to a junior developer."
- "Predict the result."

Do not allow memorized patterns to inflate mastery.

---

# 6. Caveman Teaching Mode

Create a reusable explanation component.

Example:

### Caveman Mode

> Caveman has 1 big box.
>
> Many people want things from box.
>
> Salesforce says:
>
> "Not everyone can take everything."
>
> So Salesforce checks:
>
> 1. Who are you?
> 2. What are you allowed to do?
> 3. Which records can you see?
> 4. Which fields can you touch?

Then reveal:

### Salesforce Mode

Explain:
- Object permissions
- Record-level access
- Field-level security
- Sharing model
- Permission sets
- OWD
- Role hierarchy
- Sharing rules

The application should have a **Caveman ↔ Technical toggle**.

---

# 7. Best Practice vs Anti-Pattern

Every significant concept should contain:

## ✅ Best Practice

Explain:
- What to do
- Why
- When
- Trade-offs

## ❌ Anti-Pattern

Show:
- What people commonly do wrong
- Why it appears to work
- Why it eventually fails
- Governor-limit impact
- Performance impact
- Security impact
- Maintainability impact

Example:

```text
ANTI-PATTERN

SOQL inside a loop.

Why it looks okay:
It works with 5 records.

Why it fails:
Bulk transactions can contain hundreds of records.

Result:
Too many SOQL queries.

Better:
Query once, store results in a Map, process records in memory.
```

Whenever appropriate, show code before/after.

---

# 8. Real Salesforce Documentation

The application must rely on **current official Salesforce documentation**.

Do NOT build the curriculum around stale blog posts or old certification material.

Prioritize:

1. Salesforce official documentation
2. Salesforce Developers documentation
3. Salesforce Architects documentation
4. Salesforce Trust / release documentation when relevant

Every lesson should have:

```text
Sources
- Official Salesforce documentation
- Relevant developer documentation
- Relevant architecture documentation
- Release notes when behavior is version-dependent
```

Include:
- Documentation title
- URL
- Last verified date
- Salesforce release/version if applicable

Create a source abstraction so sources can be updated without rewriting lesson content.

When Salesforce behavior changes, mark affected lessons as:

```text
⚠ Documentation Changed
```

and identify what changed.

---

# 9. Salesforce Release Awareness

Salesforce changes frequently.

Design the application so lessons can be associated with:

- Salesforce release
- API version
- Documentation version
- Last verified date

Do not silently assume old behavior is still correct.

Create a future-friendly structure such as:

```text
lesson
 ├── concept
 ├── explanation
 ├── examples
 ├── bestPractices
 ├── antiPatterns
 ├── exercises
 ├── sources
 ├── releaseNotes
 └── verification
```

---

# 10. Game Design

Make the 180-day roadmap feel like an RPG.

## Player Stats

Track:

- XP
- Level
- Streak
- Mastery %
- Concepts mastered
- Bosses defeated
- Labs completed
- Architecture score
- Debugging score
- Weak areas
- Review debt

Example:

```text
LEVEL 14 — Platform Apprentice

XP: 8,420 / 10,000

Platform Knowledge       ████████░░ 82%
Data Architecture        ██████░░░░ 64%
Security                 ███████░░░ 71%
Apex                     ████████░░ 81%
Integration              ████░░░░░░ 43%
Architecture             █████░░░░░ 51%
```

---

# 11. Worlds

Turn the curriculum into worlds.

Example:

```text
WORLD 1
The Salesforce Platform

WORLD 2
The Data Kingdom

WORLD 3
The Security Fortress

WORLD 4
The Automation Engine

WORLD 5
The Integration Network

WORLD 6
The Architect's Realm
```

Each world contains:

- Missions
- Side quests
- Labs
- Boss fights
- Hidden challenges

---

# 12. Boss Battles

At the end of every major topic, create a Boss Battle.

Boss battles should NOT be simple quizzes.

Example:

> Production incident:
>
> 8 million Accounts.
> Sharing recalculation is slow.
> Users report timeouts.
> A new automation was deployed.
>
> Diagnose the problem.
>
> Explain:
> 1. What you suspect
> 2. Why
> 3. What data you need
> 4. What you would inspect
> 5. Your proposed solution
> 6. Trade-offs

Score the response against a rubric.

---

# 13. Weekly Boss

Every 7 days, create a larger challenge combining multiple concepts.

Example:

```text
WEEK 4 BOSS

Build an architecture for:

10 million customers
50 integration partners
Complex sharing
High transaction volume
Near-real-time integration

Requirements:
- Security
- Performance
- Scalability
- Governor limits
- Error handling
- Monitoring
```

---

# 14. Capstone

Day 180 should be a major architecture challenge.

Create a realistic enterprise scenario containing:

- Large data volume
- Complex sharing
- Apex
- Flow
- Integrations
- Events
- Async processing
- Security
- Performance
- Monitoring
- Failure recovery

The user must design the system and defend decisions.

Score:

```text
Platform Knowledge
Data Architecture
Security
Apex
Automation
Integration
Scalability
Performance
Reliability
Observability
Trade-off Reasoning
Communication
```

---

# 15. Progress Measurement

Create a detailed progress system.

Track:

```text
Daily progress
Weekly progress
World progress
Concept mastery
Skill mastery
Weak concepts
Review history
Assessment results
Time spent
Confidence
Mistakes
Repeated mistakes
```

Create a "Knowledge Map."

Example:

```text
SOQL
 ├── Basic queries       95%
 ├── Selectivity         82%
 ├── Indexes             71%
 ├── Query optimizer     58% ⚠
 └── LDV                 46% ⚠
```

This should tell me exactly what I do and do not understand.

---

# 16. Spaced Repetition

Implement lightweight spaced repetition.

If I fail:

```text
Review tomorrow
```

If I struggle:

```text
Review in 3 days
```

If strong:

```text
Review in 7 days
```

If mastered:

```text
Review in 21–30 days
```

The system should dynamically generate review questions from my weaknesses.

---

# 17. Notification / Study Reminder

I want an email notification reminding me to study.

Do NOT assume that Next.js itself can reliably send scheduled emails from the browser.

Design this correctly.

Use a free/open-source or free-tier-friendly email solution where practical.

Separate:

```text
Scheduler
Email provider
Notification service
User preferences
```

For example, support a provider abstraction such as:

```text
EmailProvider
 ├── Resend
 ├── SMTP
 └── Console
```

The application should allow:

- Reminder enabled/disabled
- Preferred study time
- Time zone
- Reminder frequency
- Streak reminder
- "You have review due" reminder

Use a server-side scheduled mechanism for reminders.

If the selected provider's free tier or API limits change, document this rather than hard-coding assumptions.

---

# 18. Next.js Architecture

Use modern Next.js and TypeScript.

Prefer:

- App Router
- TypeScript
- Server Components where appropriate
- Client Components only when interactivity requires them
- PostgreSQL
- Prisma or Drizzle
- Zod
- Tailwind CSS
- shadcn/ui where appropriate

Keep the architecture clean and maintainable.

Suggested structure:

```text
app/
  dashboard/
  learn/
  world/
  lesson/
  boss/
  review/
  progress/
  settings/

components/
  learning/
  game/
  assessment/
  dashboard/
  caveman/
  charts/
  ui/

lib/
  learning-engine/
  mastery-engine/
  spaced-repetition/
  gamification/
  notifications/
  sources/
  assessments/

data/
  curriculum/
  lessons/
  challenges/

db/
  schema/
  queries/

types/
```

Adjust the structure if a better architecture is justified.

---

# 19. Domain Model

Design proper entities.

At minimum:

```text
User
LearningPath
World
Mission
Lesson
Concept
Exercise
Question
Assessment
BossBattle
Skill
Mastery
Attempt
ReviewItem
Achievement
XPTransaction
Streak
NotificationPreference
Source
Release
```

Do not over-engineer unnecessarily.

Use normalized relational data for progress and relationships.

---

# 20. AI Integration

The learning engine should be designed so an LLM can evaluate free-text answers.

The evaluator should return structured data such as:

```json
{
  "correctness": 82,
  "understanding": 74,
  "application": 68,
  "architecture": 55,
  "confidence": 61,
  "masteryDelta": 4,
  "misconceptions": [
    "Confuses object permissions with record-level sharing"
  ],
  "nextAction": "targeted_review"
}
```

Do not allow the LLM to arbitrarily change user progress.

Use validation and deterministic rules around LLM output.

---

# 21. Question Engine

Build multiple question types:

- Multiple choice
- Multiple select
- True/false
- Predict the outcome
- Debug this code
- Order the execution
- Architecture decision
- Explain why
- Teach-back
- Compare two approaches
- Find the anti-pattern
- Fix the design
- Scenario diagnosis

Question difficulty should adapt based on mastery.

---

# 22. Interactive Simulations

When possible, don't just show information.

Build simulations.

Examples:

### Governor Limit Simulator

Let the user add operations:

```text
SOQL query
DML
Callout
Loop
Async job
```

Then show how the transaction consumes limits.

### Order of Execution Simulator

Let the user arrange events and predict what runs.

### Sharing Simulator

Let the user configure:

- OWD
- Roles
- Sharing rules
- Permission sets

Then ask:

> "Can User A see Account B?"

### Query Selectivity Simulator

Let the user experiment with:

- Record counts
- Filters
- Indexed fields
- Selectivity

Then explain why a query is or isn't selective.

These simulations are extremely valuable.

---

# 23. Avoid Boring UX

Do not make the UI look like a corporate LMS.

Avoid:
- Endless paragraphs
- Giant walls of text
- Repetitive cards
- 20-question quizzes every day
- Generic progress bars only

Use:
- Missions
- Unlocks
- Animations where useful
- Interactive diagrams
- Code blocks
- Simulations
- XP
- Achievements
- Boss fights
- "Choose your move"
- Prediction/reveal
- Knowledge map
- Short explanations

The application should feel rewarding.

Do not overdo gamification to the point where it distracts from learning.

---

# 24. Daily Flexibility

The default target is 1 hour.

But support:

```text
[Continue]
[I'm confident — challenge me]
[Review weakness]
[Move to next mission]
```

If I demonstrate mastery early, unlock the next mission.

If I struggle, dynamically create reinforcement.

Never punish the user for learning faster.

---

# 25. Anti-Cramming Rule

The application should explicitly prevent "quiz gaming."

Example:

If the user gets 5 questions correct but repeatedly cannot explain the underlying concept:

```text
Mastery remains low.
```

Use concept transfer:

If I learned:

> "SOQL inside loops is bad"

ask:

> "Why?"

Then:

> "What if there is only one record?"

Then:

> "What if this runs asynchronously?"

Then:

> "How would you redesign it?"

Then:

> "Explain this to another developer."

Only then should mastery increase significantly.

---

# 26. Dashboard

Create a compelling dashboard.

Show:

```text
Good evening, Dennis.

🔥 12-day streak

LEVEL 14
Platform Apprentice

Today's Mission
"Why Salesforce Transactions Matter"

Progress: 63%

[CONTINUE MISSION]

--------------------------------

⚔ Boss Battle Available
Data Selectivity

🧠 Weak Area
Query Optimizer

🔄 3 Reviews Due

🏆 Recent Achievement
"Governor Limit Survivor"
```

Also show long-term progress toward Day 180.

---

# 27. Accessibility & Mobile

The application should work well on:

- Desktop
- Tablet
- Mobile

Learning sessions may happen on a phone.

Make interactive components touch-friendly.

Use accessible controls, keyboard navigation, semantic HTML, and readable typography.

---

# 28. Technical Quality

Follow strong engineering practices.

Include:

- Type safety
- Validation
- Error boundaries
- Loading states
- Empty states
- Tests
- Unit tests for mastery calculations
- Tests for spaced repetition
- Tests for XP calculations
- Tests for assessment scoring
- Database constraints
- Secure server actions/API routes
- Rate limiting where appropriate
- Authentication
- Authorization

Never put secrets in client-side code.

---

# 29. Build Strategy

Do NOT attempt to build all 180 days manually before validating the learning engine.

Build in stages.

## Phase 1 — Foundation

Build:

- Next.js app
- Authentication
- Database
- Dashboard
- Curriculum model
- Lesson model
- Progress tracking

## Phase 2 — Learning Engine

Build:

- Lesson player
- Caveman Mode
- Prediction/reveal
- Questions
- Free-text teach-back
- Mastery engine

## Phase 3 — Game Engine

Build:

- XP
- Levels
- Worlds
- Missions
- Bosses
- Achievements
- Streaks

## Phase 4 — Adaptive Engine

Build:

- Weakness detection
- Review scheduling
- Difficulty adjustment
- Personalized questions

## Phase 5 — Simulations

Build at least:

1. Governor Limit Simulator
2. Order of Execution Simulator
3. Sharing Simulator
4. SOQL Selectivity Simulator

## Phase 6 — Notifications

Build:

- Email reminders
- Review reminders
- Streak notifications
- Preferences
- Provider abstraction

## Phase 7 — Curriculum

Populate the 180-day curriculum.

Do not duplicate huge amounts of content manually if it can be represented through reusable structures.

---

# 30. Development Workflow

Before coding:

1. Inspect the existing repository.
2. Identify the current Next.js version.
3. Identify existing architecture.
4. Identify installed packages.
5. Identify database setup.
6. Identify authentication.
7. Identify existing UI components.
8. Do not replace working infrastructure without justification.

Then produce:

```text
ARCHITECTURE.md
```

containing:
- Architecture
- Data model
- Learning engine
- Mastery model
- Gamification
- Notification architecture
- Curriculum architecture

Then implement incrementally.

After each major feature:
- Run tests
- Run lint
- Run type checks
- Fix errors
- Verify UX

---

# 31. Important: Research Before Implementing Salesforce Content

Before generating curriculum content, research current Salesforce official documentation.

Do not assume your training data is current.

For each major subject:

```text
Search official Salesforce documentation
↓
Verify behavior
↓
Identify version/release considerations
↓
Create lesson
↓
Attach sources
↓
Create exercises
↓
Create anti-patterns
↓
Create assessment
```

If a Salesforce feature is ambiguous or documentation differs across releases, explicitly flag it.

---

# 32. Curriculum Quality Standard

Every lesson must answer:

### What?
What is this?

### Why?
Why does Salesforce have it?

### How?
How does it work?

### When?
When should I use it?

### When NOT?
When should I avoid it?

### What breaks?
What happens when it fails?

### What scales?
What happens at 1 million / 10 million records?

### What are the limits?
What governor/platform limits matter?

### What are the security implications?

### What are the performance implications?

### What is the best practice?

### What is the anti-pattern?

### Can I explain it?
Teach-back.

---

# 33. "Deep Enough" Test

A concept is not mastered until I can answer progressively harder questions:

```text
Level 1 — Define it
Level 2 — Explain it
Level 3 — Predict it
Level 4 — Apply it
Level 5 — Debug it
Level 6 — Optimize it
Level 7 — Design with it
Level 8 — Explain trade-offs
```

The system should use these levels to determine mastery.

---

# 34. Final Goal

The final product should make me feel:

> "I understand why Salesforce works this way."

Not:

> "I memorized another Salesforce exam question."

At Day 180, I should be able to look at a Salesforce system and reason about:

- Data
- Transactions
- Security
- Automation
- Apex
- Integrations
- Limits
- Performance
- Scalability
- Reliability
- Architecture

and explain **why** I would choose one solution over another.

---

# 35. First Task for Claude

Do NOT immediately start implementing everything.

First:

1. Inspect the repository.
2. Review the existing project architecture.
3. Review this specification.
4. Research the latest official Salesforce documentation relevant to the initial curriculum.
5. Produce `ARCHITECTURE.md`.
6. Produce a proposed database schema.
7. Produce the first 30 days of the curriculum at a high level.
8. Define the mastery algorithm.
9. Define the gamification system.
10. Define the email notification architecture.
11. Identify technical risks and anti-patterns in the proposed application.
12. Ask for confirmation only if there is a genuinely blocking architectural decision.

After the architecture is sound, implement the application incrementally.

---

# Reference

I also have an existing ChatGPT discussion about the Salesforce Platform Depth roadmap. Use it as an additional reference:

https://chatgpt.com/share/6a9983c1-63d0-83ec-87df-654bc02b5fea?ogimg=plain

If the shared conversation is inaccessible, use the roadmap included in this document rather than blocking development.

---

# Success Criteria

The project is successful when:

- I can study for approximately 1 hour and feel engaged.
- I can learn faster when I already understand a topic.
- The system detects when I only memorized an answer.
- The system identifies my weak concepts.
- The system gives me targeted reviews.
- I can see measurable progress.
- Lessons explain WHY, not just WHAT.
- Caveman Mode makes difficult concepts easy to enter.
- Technical Mode provides real Salesforce depth.
- Every major concept includes best practices and anti-patterns.
- Content references current Salesforce documentation.
- I can practice through simulations.
- Boss battles test real engineering judgment.
- The Day 180 assessment measures actual platform depth.
- Email reminders can reliably remind me to study.
- The architecture is maintainable and extensible.

**Build this as a serious personal Salesforce mastery system, not a toy quiz application.**
