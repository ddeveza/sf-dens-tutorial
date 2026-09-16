import type { RenderedEmail, TemplateData } from '../types.ts';
import { dailyReminder } from './daily-reminder.ts';
import { reviewDue } from './review-due.ts';
import { streakAtRisk } from './streak-at-risk.ts';

export { dailyReminder } from './daily-reminder.ts';
export { reviewDue } from './review-due.ts';
export { streakAtRisk, whatStillCounts } from './streak-at-risk.ts';
export { CTA_LABEL, DASHBOARD_PATH, PRODUCT_NAME, ctaUrl, escapeHtml } from './shared.ts';

/** Renders the template for `data.kind`. Pure. */
export function renderTemplate(data: TemplateData): RenderedEmail {
  switch (data.kind) {
    case 'daily_reminder':
      return dailyReminder(data);
    case 'review_due':
      return reviewDue(data);
    case 'streak_at_risk':
      return streakAtRisk(data);
  }
}
