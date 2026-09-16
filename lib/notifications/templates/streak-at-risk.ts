// `streak_at_risk`: "Your {n}-day streak ends at midnight"; the streak, what still counts today (copy derived from
// the passed-in `minAttempts`, the rule itself belongs to gamification) and the quickest due review.
import type { RenderedEmail, StreakAtRiskData } from '../types.ts';
import { ctaUrl, escapeHtml, layout, panel, paragraph, pluralize, textLayout } from './shared.ts';

const FREE_TEXT_KINDS_COPY = 'an explain-why, a teach-back or a scenario';

export function whatStillCounts(minAttempts: number): string {
  return `Any ${pluralize(minAttempts, 'scored attempt')} or one free-text answer (${FREE_TEXT_KINDS_COPY}) before midnight keeps it alive.`;
}

export function streakAtRisk(data: StreakAtRiskData): RenderedEmail {
  const subject = `Your ${data.streakDays}-day streak ends at midnight`;
  const href = ctaUrl(data.siteUrl);
  const countsLine = whatStillCounts(data.minAttempts);
  const quickestLine = data.quickestReview
    ? `Quickest way back: one ${data.quickestReview.questionType ? `${data.quickestReview.questionType.replace(/_/g, ' ')} ` : ''}review of ${data.quickestReview.concept}.`
    : 'Quickest way back: the warm-up on your dashboard takes a few minutes.';

  const html = layout({
    preheader: `${data.streakDays} days in a row; nothing scored yet today.`,
    heading: subject,
    blocks: [
      paragraph(`You have studied ${pluralize(data.streakDays, 'day')} in a row. Midnight in your time zone is the cutoff, and nothing has been scored yet today.`),
      panel('What still counts today', escapeHtml(countsLine)),
      panel('Fastest option', escapeHtml(quickestLine)),
    ],
    ctaHref: href,
    ctaLabel: 'Keep the streak',
  });

  const text = textLayout(
    subject,
    [`You have studied ${pluralize(data.streakDays, 'day')} in a row. Midnight in your time zone is the cutoff, and nothing has been scored yet today.`, '', countsLine, '', quickestLine],
    href,
    'Keep the streak',
  );

  return { subject, html, text };
}
