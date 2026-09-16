// Authenticated shell. The proxy already redirected a session-less request, but the proxy is not an authorization
// boundary: this layout re-checks the claims itself and every action below does the same.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/world', label: 'Worlds' },
  { href: '/review', label: 'Review' },
  { href: '/progress', label: 'Progress' },
  { href: '/settings', label: 'Settings' },
] as const;

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/auth/login');

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" aria-label="Main">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Depth Quest
          </Link>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted-foreground hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <form action={signOut} className="ml-auto">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
