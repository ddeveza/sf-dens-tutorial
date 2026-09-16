// The 180-day track: calendar day versus lessons actually finished, so a skipped week reads as a gap rather than
// as failure. `lessonsCompetent` is the honest number — completed is not the same as understood.
import type { DashboardViewModel } from '@/lib/gamification/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function Day180Track({ longTerm, stats }: Pick<DashboardViewModel, 'longTerm' | 'stats'>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">The 180 days</CardTitle>
        <CardDescription>
          Day {longTerm.dayIndex} of 180 · calendar day {longTerm.calendarDay}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={longTerm.pct} aria-label="Progress through the 180-day path" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Lessons done</dt>
            <dd className="tabular-nums">{longTerm.lessonsCompleted}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">At Competent+</dt>
            <dd className="tabular-nums">{longTerm.lessonsCompetent}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bosses defeated</dt>
            <dd className="tabular-nums">{stats.bossesDefeated}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Concepts mastered</dt>
            <dd className="tabular-nums">{stats.conceptsMastered}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
