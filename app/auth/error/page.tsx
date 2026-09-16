// Human-readable auth failure. `reason` is provider text (expired link, already used, bad token); it is rendered as
// text, never as markup, and the only way forward is asking for a fresh link.
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Sign-in problem' };

export default async function AuthErrorPage({ searchParams }: PageProps<'/auth/error'>) {
  const params = await searchParams;
  const reason = typeof params.reason === 'string' ? params.reason : 'The sign-in link did not work.';

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>That link did not work</CardTitle>
          <CardDescription>Links expire after an hour and can be used once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{reason}</p>
          <Button asChild className="w-full">
            <Link href="/auth/login">Send a new link</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
