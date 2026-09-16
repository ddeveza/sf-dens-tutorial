// Greeting, level and streak. Server-rendered: the numbers are derived from the ledger, never from client state.
// The animated StreakFlame leaf (Phase 3) replaces the static flame without changing this contract.
import type { DashboardViewModel } from '@/lib/gamification/types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

function partOfDay(localHour: number): string {
  if (localHour < 5) return 'Still up';
  if (localHour < 12) return 'Good morning';
  if (localHour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function GreetingHeader({ greeting, level, streak, xpToday }: Pick<DashboardViewModel, 'greeting' | 'level' | 'streak' | 'xpToday'>) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{`${partOfDay(greeting.localHour)}, ${greeting.displayName}`}</h1>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">
            Level {level.level} · {level.title}
          </Badge>
          <Badge variant={streak.atRisk ? 'destructive' : 'outline'}>
            {streak.current === 0 ? 'No streak yet' : `${streak.current}-day streak`}
          </Badge>
        </div>
      </div>
      <div className="space-y-1">
        <Progress value={level.pct} aria-label={`Progress to level ${level.level + 1}`} />
        <p className="text-xs text-muted-foreground">
          {level.xpIntoLevel} / {level.xpForLevel} XP this level
          {xpToday.amount > 0 ? ` · ${xpToday.amount} XP today` : ''}
          {streak.atRisk ? ' · today has no qualifying activity yet' : ''}
        </p>
      </div>
    </header>
  );
}
