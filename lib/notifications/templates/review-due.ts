// `review_due`: "{n} reviews due, plus Day {day}"; weakest concept + band, due concepts (max reviewDueListMax),
// today's mission.
import { NOTIFICATION_CONFIG, type NotificationConfig } from '../config.ts';
import type { RenderedEmail, ReviewDueData } from '../types.ts';
import { bulletList, ctaUrl, escapeHtml, layout, panel, paragraph, pluralize, textLayout } from './shared.ts';

export function reviewDue(data: ReviewDueData, config: NotificationConfig = NOTIFICATION_CONFIG): RenderedEmail {
  const subject = `${pluralize(data.reviewsDue, 'review')} due, plus Day ${data.day}`;
  const href = ctaUrl(data.siteUrl);
  const listed = data.dueConcepts.slice(0, config.reviewDueListMax);
  const remaining = data.dueConcepts.length - listed.length;
  const moreLine = remaining > 0 ? `and ${remaining} more` : null;
  const weakestLine = data.weakest ? `Weakest right now: ${data.weakest.concept} (${data.weakest.band})` : null;
  const missionLine = `Then Day ${data.day}: ${data.lessonTitle} (${data.missionTitle})`;

  const reviewItems = listed.map(escapeHtml);
  if (moreLine) reviewItems.push(`<em>${escapeHtml(moreLine)}</em>`);

  const html = layout({
    preheader: `${pluralize(data.reviewsDue, 'review')} due before Day ${data.day}.`,
    heading: subject,
    blocks: [
      paragraph(
        `Spaced review comes first today: ${pluralize(data.reviewsDue, 'concept')} ${data.reviewsDue === 1 ? 'is' : 'are'} due, each asked from a different angle than last time.`,
      ),
      ...(weakestLine ? [panel('Start here', escapeHtml(weakestLine))] : []),
      panel('Due today', reviewItems.length > 0 ? bulletList(reviewItems) : escapeHtml('Your due reviews are ready on the dashboard.')),
      panel('After the reviews', escapeHtml(missionLine)),
    ],
    ctaHref: href,
  });

  const textLines = [
    `Spaced review comes first today: ${pluralize(data.reviewsDue, 'concept')} due, each asked from a different angle than last time.`,
    ...(weakestLine ? ['', weakestLine] : []),
    '',
    'Due today:',
    ...listed.map((c) => `- ${c}`),
    ...(moreLine ? [`- ${moreLine}`] : []),
    '',
    missionLine,
  ];

  return { subject, html, text: textLayout(subject, textLines, href) };
}
