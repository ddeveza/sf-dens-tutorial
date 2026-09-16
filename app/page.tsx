// Landing page. Public by proxy policy, so it is also the page a signed-in learner hits first from a bookmark:
// claims present means the path forward is the dashboard, not a marketing pitch.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/dashboard');

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">180 days, one hour a day</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">Learn the platform deeply enough to debug it.</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Not certification trivia: execution order, governor limits, sharing, selectivity — why they exist, when they
          break, and what you do about it at ten million rows.
        </p>
      </div>
      <ul className="grid gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-lg border p-4">
          <span className="font-medium">Predict before you read.</span> Every simulation asks for your answer first.
        </li>
        <li className="rounded-lg border p-4">
          <span className="font-medium">Explain to earn it.</span> A correct guess with a weak explanation moves nothing.
        </li>
        <li className="rounded-lg border p-4">
          <span className="font-medium">Boss battles.</span> Production incidents, graded against a six-part rubric.
        </li>
      </ul>
      <div>
        <Button asChild size="lg">
          <Link href="/auth/login">Start Day 1</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        An independent study tool. Not affiliated with, or endorsed by, Salesforce; official documentation is linked,
        never copied.
      </p>
    </main>
  );
}
