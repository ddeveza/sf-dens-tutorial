// Session refresh + coarse redirect for proxy.ts (CLAUDE.md "Auth boundary"). Not an authorization boundary:
// Server Actions are POSTs to the page route, so every action and handler re-checks getClaims() itself.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

const LOGIN_PATH = '/auth/login';

/** Paths served without a session: the landing page, the auth flow and the CRON_SECRET-guarded cron routes. */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/api/cron');
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  // Nothing may run between client creation and getClaims(): a refreshed token must be written to the response
  // before any other logic, or the user is randomly logged out. getClaims() verifies locally (asymmetric keys).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  if (!claims && !isPublicPath(pathname)) {
    // Without the public-path exemption the login page redirects to itself and the cookie-less cron GET
    // receives a 307 that cron callers never follow.
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Always the same response object the client wrote cookies into; a fresh NextResponse here would drop them.
  return supabaseResponse;
}
