// Browser client: auth UI only (LoginForm's signInWithOtp / signInWithOAuth). Data never flows through it;
// pages and Server Actions use lib/supabase/server.ts. NEXT_PUBLIC_* are referenced literally so Next inlines them.
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
