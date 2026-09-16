// Boss state. A boss is graded, never rolled: the card offers the fight only when the board says `available`.
import Link from 'next/link';
import type { BossStatus, DashboardViewModel } from '@/lib/gamification/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_LABELS: Record<BossStatus, string> = {
  locked: 'Locked',
  available: 'Available',
  cooldown: 'One attempt a day',
  defeated: 'Defeated',
  expired: 'Expired',
};

export function BossAvailableCard({ boss }: Pick<DashboardViewModel, 'boss'>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Boss</CardTitle>
          {boss ? <Badge variant={boss.status === 'available' ? 'default' : 'outline'}>{STATUS_LABELS[boss.status]}</Badge> : null}
        </div>
        <CardDescription>
          {boss
            ? boss.title
            : 'No boss yet. Finishing a mission unlocks its boss; a weekly boss arrives every seven days.'}
        </CardDescription>
      </CardHeader>
      {boss ? (
        <CardContent className="space-y-2">
          {boss.lastRubric ? (
            <p className="text-xs text-muted-foreground">
              Last attempt scored {Math.round(boss.lastRubric.overall)} · weakest: {boss.lastRubric.weakest}
            </p>
          ) : null}
          <Button asChild size="sm" variant={boss.status === 'available' ? 'default' : 'outline'} disabled={boss.status === 'locked'}>
            <Link href={`/boss/${boss.ref}`}>{boss.status === 'available' ? 'Fight' : 'See the brief'}</Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
