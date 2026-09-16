// The weakest concept the knowledge map flags, with the reason spelled out in words (colour is never the only signal).
import Link from 'next/link';
import type { DashboardViewModel, WeakReason } from '@/lib/gamification/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const REASON_LABELS: Record<WeakReason, string> = {
  below_developing: 'still below Developing',
  lopsided: 'recall is ahead of understanding',
  repeated_misconception: 'the same misconception came back',
  decayed: 'untouched long enough to fade',
};

export function WeakAreaCard({ weakArea }: Pick<DashboardViewModel, 'weakArea'>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weak area</CardTitle>
        <CardDescription>
          {weakArea
            ? `${weakArea.name} — ${weakArea.reasons.map((reason) => REASON_LABELS[reason]).join('; ') || 'needs another angle'}.`
            : 'Nothing flagged. Weak areas appear once a concept has enough evidence to judge.'}
        </CardDescription>
      </CardHeader>
      {weakArea ? (
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums">{Math.round(weakArea.overall)}</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/review?concept=${encodeURIComponent(weakArea.reviewSlug)}`}>Work on it</Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
