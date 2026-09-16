// Server client over the request cookies (CLAUDE.md "Auth boundary"). A new instance per call, never module-level:
// the cookie store is request-scoped. `import 'server-only'` makes a client-bundle import fail `next build`.
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies cannot be written. Intentional: the proxy
            // (lib/supabase/proxy.ts) refreshes sessions and writes the cookies on every matched request.
          }
        },
      },
    },
  );
}
