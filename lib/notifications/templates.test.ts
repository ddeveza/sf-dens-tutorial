import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CONFIG } from './config.ts';
import { dailyReminder } from './templates/daily-reminder.ts';
import { renderTemplate } from './templates/index.ts';
import { reviewDue } from './templates/review-due.ts';
import { ctaUrl, escapeHtml } from './templates/shared.ts';
import { streakAtRisk } from './templates/streak-at-risk.ts';
import type { DailyReminderData, RenderedEmail, ReviewDueData, StreakAtRiskData } from './types.ts';

const SITE = 'https://depth-quest.example.com';
const CTA = `${SITE}/dashboard`;

const daily: DailyReminderData = {
  siteUrl: SITE,
  day: 4,
  lessonTitle: 'Record IDs',
  missionTitle: 'The Shape of the Data',
  streakDays: 3,
  level: 2,
  levelTitle: 'Platform Novice',
  teaser: 'You VLOOKUP a report export of Account IDs against an API export. Does every row match?',
};

const review: ReviewDueData = {
  siteUrl: SITE,
  day: 4,
  lessonTitle: 'Record IDs',
  missionTitle: 'The Shape of the Data',
  reviewsDue: 3,
  weakest: { concept: 'Sandbox refresh intervals', band: 'familiar' },
  dueConcepts: ['Sandbox refresh intervals', 'Multitenant kernel', 'Release cadence'],
};

const streak: StreakAtRiskData = {
  siteUrl: SITE,
  streakDays: 9,
  minAttempts: 3,
  quickestReview: { concept: 'Key prefixes', questionType: 'mcq' },
};

function expectWellFormed(email: RenderedEmail): void {
  expect(email.subject.trim().length).toBeGreaterThan(0);
  expect(email.text.trim().length).toBeGreaterThan(0);
  expect(email.html).toContain(`href="${CTA}"`);
  expect(email.html.match(/<a\s/g)).toHaveLength(1); // exactly one CTA link
  expect(email.text).toContain(CTA);
  expect(email.html).toMatch(/style="/); // inline CSS only
  expect(email.html).not.toMatch(/<link|<script|<style/i);
}

describe('daily-reminder', () => {
  it('uses the subject "Day {day}: {lesson title}"', () => {
    expect(dailyReminder(daily).subject).toBe('Day 4: Record IDs');
  });

  it('renders mission, streak, level and the teaser with one CTA and a text alternative', () => {
    const email = dailyReminder(daily);
    expectWellFormed(email);
    expect(email.html).toContain('The Shape of the Data');
    expect(email.html).toContain('3-day streak');
    expect(email.html).toContain('Level 2');
    expect(email.html).toContain('Platform Novice');
    expect(email.html).toContain('Does every row match?');
    expect(email.text).toContain('Record IDs');
    expect(email.text).toContain('Does every row match?');
  });

  it('describes a fresh streak without a day count', () => {
    const email = dailyReminder({ ...daily, streakDays: 0 });
    expect(email.html).not.toContain('0-day streak');
    expect(email.text).not.toContain('0-day streak');
  });

  it('escapes HTML in content fields but leaves the text alternative raw', () => {
    const email = dailyReminder({ ...daily, lessonTitle: 'Lookups & <b>master-detail</b>' });
    expect(email.subject).toBe('Day 4: Lookups & <b>master-detail</b>');
    expect(email.html).toContain('Lookups &amp; &lt;b&gt;master-detail&lt;/b&gt;');
    expect(email.html).not.toContain('<b>master-detail</b>');
    expect(email.text).toContain('Lookups & <b>master-detail</b>');
  });
});

describe('review-due', () => {
  it('uses the subject "{n} reviews due, plus Day {day}" and the singular for one', () => {
    expect(reviewDue(review).subject).toBe('3 reviews due, plus Day 4');
    expect(reviewDue({ ...review, reviewsDue: 1, dueConcepts: ['Key prefixes'] }).subject).toBe('1 review due, plus Day 4');
  });

  it('lists the weakest concept with its band, the due concepts and today\'s mission', () => {
    const email = reviewDue(review);
    expectWellFormed(email);
    expect(email.html).toContain('Sandbox refresh intervals');
    expect(email.html).toMatch(/familiar/i);
    expect(email.html).toContain('Multitenant kernel');
    expect(email.html).toContain('Release cadence');
    expect(email.html).toContain('Day 4');
    expect(email.html).toContain('The Shape of the Data');
    expect(email.text).toContain('Multitenant kernel');
  });

  it('lists at most reviewDueListMax concepts and says how many more', () => {
    const many = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
    const email = reviewDue({ ...review, reviewsDue: 7, dueConcepts: many });
    expect(NOTIFICATION_CONFIG.reviewDueListMax).toBe(5);
    for (const c of many.slice(0, 5)) expect(email.html).toContain(`>${c}<`);
    expect(email.html).not.toContain('>c6<');
    expect(email.html).not.toContain('>c7<');
    expect(email.html).toContain('2 more');
    expect(email.text).toContain('2 more');
  });

  it('copes with no weakest concept yet', () => {
    const email = reviewDue({ ...review, weakest: null });
    expectWellFormed(email);
    expect(email.html).not.toContain('undefined');
    expect(email.html).not.toContain('null');
  });
});

describe('streak-at-risk', () => {
  it('uses the subject "Your {n}-day streak ends at midnight"', () => {
    expect(streakAtRisk(streak).subject).toBe('Your 9-day streak ends at midnight');
  });

  it('derives the "what still counts" copy from the passed-in minAttempts', () => {
    const email = streakAtRisk(streak);
    expectWellFormed(email);
    expect(email.html).toContain('3 scored attempts');
    expect(email.html).toContain('one free-text answer');
    expect(email.text).toContain('3 scored attempts');
    const five = streakAtRisk({ ...streak, minAttempts: 5 });
    expect(five.html).toContain('5 scored attempts');
    expect(five.html).not.toContain('3 scored attempts');
  });

  it('names the quickest due review when there is one', () => {
    expect(streakAtRisk(streak).html).toContain('Key prefixes');
    const none = streakAtRisk({ ...streak, quickestReview: null });
    expectWellFormed(none);
    expect(none.html).not.toContain('undefined');
  });
});

describe('renderTemplate', () => {
  it('dispatches on kind', () => {
    expect(renderTemplate({ kind: 'daily_reminder', ...daily }).subject).toBe('Day 4: Record IDs');
    expect(renderTemplate({ kind: 'review_due', ...review }).subject).toBe('3 reviews due, plus Day 4');
    expect(renderTemplate({ kind: 'streak_at_risk', ...streak }).subject).toBe('Your 9-day streak ends at midnight');
  });
});

describe('shared helpers', () => {
  it('ctaUrl appends /dashboard exactly once regardless of trailing slashes', () => {
    expect(ctaUrl(SITE)).toBe(CTA);
    expect(ctaUrl(`${SITE}/`)).toBe(CTA);
    expect(ctaUrl(`${SITE}//`)).toBe(CTA);
    expect(ctaUrl('http://localhost:3000')).toBe('http://localhost:3000/dashboard');
  });

  it('escapeHtml neutralises the five significant characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
    expect(escapeHtml('plain')).toBe('plain');
  });
});
