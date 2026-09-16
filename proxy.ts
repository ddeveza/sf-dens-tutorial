// Next.js 16 proxy (never middleware.ts): Node runtime, no `runtime` export. Only delegates to lib/supabase/proxy.ts.
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except Next internals, the favicon and static image assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
