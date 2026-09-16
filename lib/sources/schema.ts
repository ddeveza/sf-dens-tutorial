import { z } from 'zod';
import { SOURCE_STATUSES, SOURCE_TIERS, VERIFICATION_STATUSES, tierPrefix } from './types.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const ReleaseIdSchema = z.string().regex(/^(spring|summer|winter)-\d{2}$/, '<season>-<yy>');

export const VerificationSchema = z
  .object({
    release: ReleaseIdSchema,
    apiVersion: z.string().regex(/^\d{2,3}\.0$/),
    docVersion: z.string().min(1),
    lastVerified: isoDate,
    status: z.enum(VERIFICATION_STATUSES),
  })
  .strict();

export const SourceSchema = z
  .object({
    id: z.string().regex(/^(help|dev|arch|rn|other)-[a-z0-9-]+$/),
    title: z.string().min(1),
    url: z.string().url(),
    tier: z.enum(SOURCE_TIERS),
    lastVerified: isoDate.nullable(),
    release: ReleaseIdSchema.optional(),
    apiVersion: z.string().optional(),
    docVersion: z.string().optional(),
    status: z.enum(SOURCE_STATUSES),
    changeNote: z.object({ since: isoDate, what: z.string().min(1) }).strict().optional(),
    fetchedOk: z.boolean().optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (!s.id.startsWith(`${tierPrefix[s.tier]}-`)) {
      ctx.addIssue({ code: 'custom', message: `id prefix must be '${tierPrefix[s.tier]}-' for tier ${s.tier}`, path: ['id'] });
    }
    if (s.status === 'unverified' && s.lastVerified !== null) {
      ctx.addIssue({ code: 'custom', message: 'unverified sources carry no lastVerified date', path: ['lastVerified'] });
    }
    if (s.status !== 'unverified' && s.lastVerified === null) {
      ctx.addIssue({ code: 'custom', message: 'lastVerified required unless status is unverified', path: ['lastVerified'] });
    }
    if (s.status === 'stale') {
      ctx.addIssue({ code: 'custom', message: "'stale' is derived, never authored", path: ['status'] });
    }
    if (s.status === 'documentation_changed' && !s.changeNote) {
      ctx.addIssue({ code: 'custom', message: 'documentation_changed requires changeNote', path: ['changeNote'] });
    }
    if (s.url.toLowerCase().endsWith('.pdf') && !s.docVersion) {
      ctx.addIssue({ code: 'custom', message: 'docVersion required for PDF sources', path: ['docVersion'] });
    }
  });

export const ReleaseSchema = z
  .object({
    id: ReleaseIdSchema,
    name: z.string().min(1),
    apiVersion: z.string().regex(/^\d{2,3}\.0$/),
    ga: z.object({ sandboxPreview: z.string(), productionWeekends: z.array(z.string()) }).strict(),
    notesUrl: z.string().url(),
    sourceId: z.string(),
  })
  .strict();
