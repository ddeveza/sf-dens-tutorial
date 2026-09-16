import { describe, expect, it, vi } from 'vitest';
import { createResendProvider, type ResendEmailClient } from './resend.ts';

const msg = { to: 'learner@example.com', subject: 'Day 4: Record IDs', html: '<p>hi</p>', text: 'hi' };

function client(send: ResendEmailClient['emails']['send']): ResendEmailClient {
  return { emails: { send } };
}

describe('resend provider', () => {
  it('sends from the configured address and returns the Resend id', async () => {
    const send = vi.fn(async () => ({ data: { id: 'email_123' }, error: null }));
    const provider = createResendProvider({ apiKey: 're_test', from: 'Depth Quest <reminders@mail.example.com>', client: client(send) });
    expect(provider.name).toBe('resend');
    await expect(provider.send(msg)).resolves.toEqual({ id: 'email_123' });
    expect(send).toHaveBeenCalledWith({ from: 'Depth Quest <reminders@mail.example.com>', to: 'learner@example.com', subject: 'Day 4: Record IDs', html: '<p>hi</p>', text: 'hi' });
  });

  it('maps the { error } response (Resend never throws) to { error }', async () => {
    const send = vi.fn(async () => ({ data: null, error: { name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.', statusCode: 429 } }));
    const provider = createResendProvider({ apiKey: 're_test', from: 'a@b.c', client: client(send) });
    await expect(provider.send(msg)).resolves.toEqual({ error: 'daily_quota_exceeded: You have reached your daily email sending quota.' });
  });

  it('still returns { error } if the client throws', async () => {
    const send = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = createResendProvider({ apiKey: 're_test', from: 'a@b.c', client: client(send) });
    await expect(provider.send(msg)).resolves.toEqual({ error: 'fetch failed' });
  });

  it('treats a response with neither data nor error as a failure', async () => {
    const send = vi.fn(async () => ({ data: null, error: null }));
    const provider = createResendProvider({ apiKey: 're_test', from: 'a@b.c', client: client(send) });
    const result = await provider.send(msg);
    expect(result).toHaveProperty('error');
  });
});
