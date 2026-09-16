// `daily_reminder`: "Day {day}: {lesson title}"; today's mission, streak, level, one boss-style teaser question.
import type { DailyReminderData, RenderedEmail } from '../types.ts';
import { bulletList, ctaUrl, escapeHtml, layout, panel, paragraph, textLayout } from './shared.ts';

export function dailyReminder(data: DailyReminderData): RenderedEmail {
  const subject = `Day ${data.day}: ${data.lessonTitle}`;
  const href = ctaUrl(data.siteUrl);
  const streakLine = data.streakDays > 0 ? `${data.streakDays}-day streak, keep it going` : 'No streak yet; today can start one';
  const levelLine = `Level ${data.level}, ${data.levelTitle}`;
  const missionLine = `Mission: ${data.missionTitle}`;

  const html = layout({
    preheader: `Today: ${data.lessonTitle}. ${streakLine}.`,
    heading: subject,
    blocks: [
      paragraph(`About an hour of platform depth is waiting. Today's lesson is <strong>${escapeHtml(data.lessonTitle)}</strong>.`),
      panel('Where you are', bulletList([escapeHtml(missionLine), escapeHtml(streakLine), escapeHtml(levelLine)])),
      panel('Before you start, predict', `${escapeHtml(data.teaser)}<br><span style="color:#5f6368;">Commit to an answer; the session checks it against how the platform actually behaves.</span>`),
      paragraph('The session ends as soon as mastery shows; it is never padded to fill the hour.'),
    ],
    ctaHref: href,
  });

  const text = textLayout(
    subject,
    [
      `Today's lesson is ${data.lessonTitle}.`,
      missionLine,
      streakLine,
      levelLine,
      '',
      'Before you start, predict:',
      data.teaser,
      'Commit to an answer; the session checks it against how the platform actually behaves.',
    ],
    href,
  );

  return { subject, html, text };
}
