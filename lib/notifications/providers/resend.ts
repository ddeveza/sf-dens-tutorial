// Resend provider. `emails.send` returns `{ data, error }` and never throws by contract; we still guard so a
// transport-level exception becomes `{ error }` too. Config arrives as constructor args, never from process.env.
import { Resend } from 'resend';
import { errorMessage } from '../errors.ts';
import type { EmailProvider } from '../types.ts';

export interface ResendSendPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface ResendSendResponse {
  data: { id: string } | null;
  error: { name: string; message: string } | null;
}

/** The slice of the Resend SDK the provider uses; the real client satisfies it structurally. */
export interface ResendEmailClient {
  emails: {
    send(payload: ResendSendPayload): Promise<ResendSendResponse>;
  };
}

export interface ResendProviderOptions {
  apiKey: string;
  /** Sender on a verified (sub)domain; onboarding@resend.dev only reaches the account owner. */
  from: string;
  /** Injected in tests; defaults to `new Resend(apiKey)`. */
  client?: ResendEmailClient;
}

export function createResendProvider(options: ResendProviderOptions): EmailProvider {
  const client: ResendEmailClient = options.client ?? new Resend(options.apiKey);
  return {
    name: 'resend',
    async send(msg) {
      try {
        const { data, error } = await client.emails.send({ from: options.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
        if (error) return { error: `${error.name}: ${error.message}` };
        if (!data?.id) return { error: 'resend returned neither data nor error' };
        return { id: data.id };
      } catch (e) {
        return { error: errorMessage(e) };
      }
    },
  };
}
