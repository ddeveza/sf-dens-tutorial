'use server';

// Sign-out lives in a Server Action so the cookie clear happens on a POST the proxy also sees. Redirect() throws,
// so it runs outside the try/catch that would otherwise swallow it.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/auth/login');
}
