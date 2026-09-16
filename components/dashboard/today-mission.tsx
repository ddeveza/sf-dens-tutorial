// The dashboard's single primary call to action (anti-overgamification guardrail 10): the next step of the lesson
// the learning engine picked. Everything else on the page is a secondary card.
import Link from 'next/link';
import type { DashboardViewModel } from '@/lib/gamification/types';
import type { Segment } from '@/lib/learning-engine/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const SEGMENT_LABELS: Record<Segment, string> = {
  warm_up: 'Warm-up',
  learn: 'Learn',
  deep_dive: 'Deep dive',
  lab: 'Lab',
  teach_back: 'Teach-back',
  challenge: 'Challenge',
};

export function TodayMission({ mission }: { mission: DashboardViewModel['todayMission'] }) {
  if (!mission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No lesson waiting</CardTitle>
          <CardDescription>
            The curriculum registry has no unfinished core lesson. Once days are published (or synced with
            <code className="mx-1 font-mono text-xs">npm run curriculum:sync</code>) the next one appears here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/world">Browse the worlds</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const started = mission.progressPct > 0;
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Day {mission.dayIndex} · next up: {SEGMENT_LABELS[mission.nextStep]}
        </CardDescription>
        <CardTitle className="text-xl">{mission.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {started ? <Progress value={mission.progressPct} aria-label="Lesson progress" /> : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/learn">{started ? 'Continue' : 'Start'}</Link>
          </Button>
          {mission.actions.includes('challenge_me') ? (
            <Button asChild variant="outline">
              <Link href={`/lesson/${mission.lessonSlug}?mode=challenge`}>Challenge me</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
