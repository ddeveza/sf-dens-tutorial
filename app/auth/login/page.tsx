// Public page: the email field plus an optional `?error=` banner. The proxy exempts /auth/*, so a signed-in visitor
// lands here only by typing the URL; the claims check sends them on rather than showing a second login.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/ui/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { siteUrl } from '@/lib/env/server';
import { safeNext } from '@/lib/supabase/next-param';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/auth/login'>) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect(next);

  const error = typeof params.error === 'string' ? params.error : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>We email a one-time link. No password to forget.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {error}
            </p>
          ) : null}
          <LoginForm next={next} siteUrl={siteUrl()} />
          <p className="text-xs text-muted-foreground">
            By signing in you agree to keep your own study data. <Link href="/">Back to the landing page</Link>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
