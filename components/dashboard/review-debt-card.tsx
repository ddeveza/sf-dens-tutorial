// Reviews due today, with the empty state designed rather than blank (ARCHITECTURE "Empty states are designed").
import Link from 'next/link';
import type { DashboardViewModel } from '@/lib/gamification/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ReviewDebtCard({ reviewsDue }: Pick<DashboardViewModel, 'reviewsDue'>) {
  const { due, overdue, nextDueOn } = reviewsDue;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review</CardTitle>
        <CardDescription>
          {due === 0
            ? nextDueOn
              ? `Nothing due. Next item on ${nextDueOn}.`
              : 'Nothing due yet. Reviews appear a few days after a concept is first answered.'
            : `${due} due${overdue > 0 ? `, ${overdue} overdue` : ''}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant={due > 0 ? 'default' : 'outline'} size="sm">
          <Link href="/review">{due > 0 ? 'Clear the queue' : 'Challenge me'}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
