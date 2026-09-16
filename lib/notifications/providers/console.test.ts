import { describe, expect, it } from 'vitest';
import { createConsoleProvider } from './console.ts';

const msg = { to: 'learner@example.com', subject: 'Day 4: Record IDs', html: '<p>hi</p>', text: 'hi\nhttps://example.com/dashboard' };

describe('console provider', () => {
  it('is named console and writes the message to the sink', async () => {
    const lines: string[] = [];
    const provider = createConsoleProvider({ write: (line) => lines.push(line) });
    expect(provider.name).toBe('console');
    const result = await provider.send(msg);
    expect(result).toHaveProperty('id');
    const out = lines.join('\n');
    expect(out).toContain('To: learner@example.com');
    expect(out).toContain('Subject: Day 4: Record IDs');
    expect(out).toContain('https://example.com/dashboard');
    expect(out).not.toContain('<p>'); // the text alternative is what a developer reads
  });

  it('returns a distinct id per send and never an error', async () => {
    const provider = createConsoleProvider({ write: () => undefined });
    const a = await provider.send(msg);
    const b = await provider.send(msg);
    expect('id' in a && 'id' in b).toBe(true);
    if ('id' in a && 'id' in b) expect(a.id).not.toBe(b.id);
  });

  it('reports a sink failure as { error } instead of throwing', async () => {
    const provider = createConsoleProvider({
      write: () => {
        throw new Error('stdout closed');
      },
    });
    await expect(provider.send(msg)).resolves.toEqual({ error: 'stdout closed' });
  });
});
