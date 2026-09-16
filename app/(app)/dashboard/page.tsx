// Dashboard: one loader, one pure view-model builder, no client fetching. Reads cookies, so it is always dynamic.
import { BossAvailableCard } from '@/components/dashboard/boss-available-card';
import { Day180Track } from '@/components/dashboard/day180-track';
import { GreetingHeader } from '@/components/dashboard/greeting-header';
import { ReviewDebtCard } from '@/components/dashboard/review-debt-card';
import { TodayMission } from '@/components/dashboard/today-mission';
import { WeakAreaCard } from '@/components/dashboard/weak-area-card';
import { loadCurrentLesson } from '@/db/queries/current-lesson';
import { loadDashboardContext } from '@/db/queries/dashboard';
import { getWeeklyTemplates, listWorlds, toWeeklyTemplateRows } from '@/lib/curriculum';
import { buildDashboardViewModel } from '@/lib/gamification';
import { requireUserId } from '@/lib/supabase/claims';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { userId } = await requireUserId(supabase);

  // Weekly boss templates carry an exercise body, so they live in data/ and are handed to the context as an extra.
  const weeklyTemplates = toWeeklyTemplateRows(listWorlds().flatMap((world) => getWeeklyTemplates(world.slug)));
  const currentLesson = await loadCurrentLesson(supabase, userId);
  const context = await loadDashboardContext(supabase, userId, { currentLesson, weeklyTemplates });
  const view = buildDashboardViewModel(context.gamification, context.now);

  return (
    <div className="space-y-6">
      <GreetingHeader greeting={view.greeting} level={view.level} streak={view.streak} xpToday={view.xpToday} />
      <TodayMission mission={view.todayMission} />
      <div className="grid gap-4 sm:grid-cols-3">
        <ReviewDebtCard reviewsDue={view.reviewsDue} />
        <WeakAreaCard weakArea={view.weakArea} />
        <BossAvailableCard boss={view.boss} />
      </div>
      <Day180Track longTerm={view.longTerm} stats={view.stats} />
    </div>
  );
}
