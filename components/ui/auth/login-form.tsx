'use client';

// Magic-link form (ARCHITECTURE.md "Auth flow"): the only place the browser client is used. `signInWithOtp` always
// resolves 200 for an unknown address (no account enumeration), so the sent state never reveals whether the account
// existed. `emailRedirectTo` points at /auth/confirm, which the Supabase magic-link template links to with the token
// hash appended.
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string };

export interface LoginFormProps {
  /** Same-origin path the confirm handler redirects to once the session exists; already `safeNext`-checked. */
  next: string;
  /** Absolute origin for the email link; resolved on the server (`siteUrl()`), never guessed in the browser. */
  siteUrl: string;
}

export function LoginForm({ next, siteUrl }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (address === '') return;
    setStatus({ kind: 'sending' });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: siteUrl + '/auth/confirm?next=' + encodeURIComponent(next),
      },
    });
    setStatus(error ? { kind: 'error', message: error.message } : { kind: 'sent', email: address });
  }

  if (status.kind === 'sent') {
    return (
      <div className="space-y-3" aria-live="polite">
        <p className="text-sm">
          Check <span className="font-medium">{status.email}</span> for a sign-in link. It expires in an hour.
        </p>
        <Button variant="outline" onClick={() => setStatus({ kind: 'idle' })}>
          Use a different address
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          // >= 16px keeps iOS from zooming the viewport on focus.
          className="text-base"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status.kind === 'sending'}
        />
      </div>
      <Button type="submit" className="w-full" disabled={status.kind === 'sending'} aria-busy={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Sending link…' : 'Send sign-in link'}
      </Button>
      {status.kind === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
