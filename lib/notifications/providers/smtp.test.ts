import { describe, expect, it, vi } from 'vitest';
import { createSmtpProvider, type SmtpTransport, type SmtpTransportOptions } from './smtp.ts';

const msg = { to: 'learner@example.com', subject: 'Day 4: Record IDs', html: '<p>hi</p>', text: 'hi' };

function factory(sendMail: SmtpTransport['sendMail']): { factory: (opts: SmtpTransportOptions) => SmtpTransport; seen: SmtpTransportOptions[] } {
  const seen: SmtpTransportOptions[] = [];
  return {
    seen,
    factory: (opts) => {
      seen.push(opts);
      return { sendMail };
    },
  };
}

describe('smtp provider', () => {
  it('builds the transport from the passed-in options, not process.env, and returns the message id', async () => {
    const sendMail = vi.fn(async () => ({ messageId: '<abc@mail.example.com>' }));
    const { factory: transportFactory, seen } = factory(sendMail);
    const provider = createSmtpProvider({ host: 'smtp.example.com', port: 587, user: 'u', pass: 'p', from: 'reminders@example.com', transportFactory });
    expect(provider.name).toBe('smtp');
    expect(seen).toEqual([{ host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'u', pass: 'p' } }]);
    await expect(provider.send(msg)).resolves.toEqual({ id: '<abc@mail.example.com>' });
    expect(sendMail).toHaveBeenCalledWith({ from: 'reminders@example.com', to: 'learner@example.com', subject: 'Day 4: Record IDs', html: '<p>hi</p>', text: 'hi' });
  });

  it('uses implicit TLS on port 465 unless overridden, and omits auth without credentials', () => {
    const { factory: transportFactory, seen } = factory(async () => ({ messageId: 'x' }));
    createSmtpProvider({ host: 'smtp.example.com', port: 465, from: 'a@b.c', transportFactory });
    createSmtpProvider({ host: 'smtp.example.com', port: 465, secure: false, from: 'a@b.c', transportFactory });
    expect(seen[0]).toEqual({ host: 'smtp.example.com', port: 465, secure: true });
    expect(seen[1]).toEqual({ host: 'smtp.example.com', port: 465, secure: false });
  });

  it('maps a transport rejection to { error }', async () => {
    const { factory: transportFactory } = factory(async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:587');
    });
    const provider = createSmtpProvider({ host: 'localhost', port: 587, from: 'a@b.c', transportFactory });
    await expect(provider.send(msg)).resolves.toEqual({ error: 'ECONNREFUSED 127.0.0.1:587' });
  });

  it('treats a missing message id as a failure', async () => {
    const { factory: transportFactory } = factory(async () => ({ messageId: '' }));
    const provider = createSmtpProvider({ host: 'localhost', port: 587, from: 'a@b.c', transportFactory });
    expect(await provider.send(msg)).toHaveProperty('error');
  });
});
