// Shared rendering for the three reminder templates: inline CSS only, one CTA link, a plain-text alternative.
// Independent product: "Depth Quest" is the name in learner-facing copy, with an explicit non-affiliation note.

export const PRODUCT_NAME = 'Depth Quest';
export const DASHBOARD_PATH = '/dashboard';
export const CTA_LABEL = 'Open today\'s session';
const FOOTER_NOTE = `${PRODUCT_NAME} is an independent learning project and is not affiliated with or endorsed by Salesforce. You receive this because reminders are enabled in your settings.`;

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** `${siteUrl}/dashboard` with any trailing slashes on `siteUrl` collapsed. */
export function ctaUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${DASHBOARD_PATH}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Palette and type ramp, kept as data so the three templates stay visually one system.
const COLORS = { ink: '#1a1a1a', muted: '#5f6368', accent: '#0b5cad', accentInk: '#ffffff', panel: '#f4f6f8', line: '#e1e4e8', page: '#ffffff' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface HtmlBlock {
  /** Already-escaped HTML for the block body. */
  html: string;
}

export function paragraph(escapedHtml: string): HtmlBlock {
  return { html: `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${COLORS.ink};">${escapedHtml}</p>` };
}

export function panel(title: string, escapedHtml: string): HtmlBlock {
  return {
    html:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">` +
      `<tr><td style="background:${COLORS.panel};border:1px solid ${COLORS.line};border-radius:8px;padding:16px;">` +
      `<div style="font-size:12px;line-height:16px;letter-spacing:0.04em;text-transform:uppercase;color:${COLORS.muted};margin:0 0 8px;">${escapeHtml(title)}</div>` +
      `<div style="font-size:16px;line-height:24px;color:${COLORS.ink};">${escapedHtml}</div>` +
      `</td></tr></table>`,
  };
}

export function bulletList(escapedItems: readonly string[]): string {
  return `<ul style="margin:0;padding:0 0 0 20px;">${escapedItems.map((item) => `<li style="margin:0 0 6px;">${item}</li>`).join('')}</ul>`;
}

export interface LayoutInput {
  /** Hidden preview text some clients show next to the subject. */
  preheader: string;
  heading: string;
  blocks: readonly HtmlBlock[];
  ctaHref: string;
  ctaLabel?: string;
}

/** The single HTML document shape used by every template; the CTA is the only anchor in the document. */
export function layout(input: LayoutInput): string {
  const cta = escapeHtml(input.ctaHref);
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLORS.panel};font-family:${FONT};">` +
    `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.panel};">${escapeHtml(input.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${COLORS.panel};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;background:${COLORS.page};border:1px solid ${COLORS.line};border-radius:12px;">` +
    `<tr><td style="padding:28px 28px 8px;">` +
    `<div style="font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.accent};margin:0 0 12px;">${escapeHtml(PRODUCT_NAME)}</div>` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${COLORS.ink};">${escapeHtml(input.heading)}</h1>` +
    input.blocks.map((b) => b.html).join('') +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:collapse;"><tr><td style="background:${COLORS.accent};border-radius:8px;">` +
    `<a href="${cta}" style="display:inline-block;padding:12px 20px;font-size:16px;line-height:24px;font-weight:600;color:${COLORS.accentInk};text-decoration:none;">${escapeHtml(input.ctaLabel ?? CTA_LABEL)}</a>` +
    `</td></tr></table>` +
    `</td></tr>` +
    `<tr><td style="padding:0 28px 24px;">` +
    `<p style="margin:0;font-size:12px;line-height:18px;color:${COLORS.muted};">${escapeHtml(FOOTER_NOTE)}<br>${cta}</p>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

/** Plain-text alternative: heading, blank line, the lines, the CTA and the footer note. */
export function textLayout(heading: string, lines: readonly string[], ctaHref: string, ctaLabel = CTA_LABEL): string {
  return [`${PRODUCT_NAME}`, '', heading, '', ...lines, '', `${ctaLabel}: ${ctaHref}`, '', FOOTER_NOTE].join('\n');
}
