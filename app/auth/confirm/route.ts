// Magic-link landing: `token_hash` + `type` -> verifyOtp, which writes the session cookies through the server
// client's setAll. Never trust `next` from the query without safeNext (open-redirect guard).
import { redirect } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNext } from '@/lib/supabase/next-param';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

function otpType(value: string | null): EmailOtpType | null {
  return OTP_TYPES.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function errorRedirect(message: string): never {
  redirect('/auth/error?reason=' + encodeURIComponent(message));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = otpType(url.searchParams.get('type'));
  const next = safeNext(url.searchParams.get('next'));

  if (!tokenHash || !type) errorRedirect('That link is missing its token. Send a new one.');

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) errorRedirect(error.message);

  redirect(next);
}
