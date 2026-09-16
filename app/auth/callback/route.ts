// OAuth/PKCE landing (optional providers): `code` -> exchangeCodeForSession. The PKCE verifier cookie was written
// by @supabase/ssr when signInWithOAuth ran in the browser.
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/supabase/next-param';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) redirect('/auth/error?reason=' + encodeURIComponent('That sign-in link is missing its code.'));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) redirect('/auth/error?reason=' + encodeURIComponent(error.message));

  redirect(next);
}
