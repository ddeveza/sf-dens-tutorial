// /dashboard loader: profile first (its time zone fixes `todayLocal` once), then every gamification input in one
// Promise.all. `now` is a parameter so Playwright fixtures and unit tests can pin the clock.
import 'server-only';
import { localDateOf } from '@/lib/gamification/dates';
import type { GamificationContext } from '@/lib/gamification/context';
import type { Db } from './client';
import { loadGamificationContext, type GamificationExtras } from './gamification';
import { requireProfile, type ProfileRow } from './profiles';

export interface DashboardContext {
  profile: ProfileRow;
  /** YYYY-MM-DD in profiles.time_zone, computed once (Intl.DateTimeFormat formatToParts). */
  todayLocal: string;
  /** ISO instant the context was loaded at; pass it as `now` to the pure view-model builders. */
  now: string;
  gamification: GamificationContext;
}

export type DashboardExtras = Omit<GamificationExtras, 'profile'> & { now?: Date };

export async function loadDashboardContext(db: Db, userId: string, extras: DashboardExtras = {}): Promise<DashboardContext> {
  const now = extras.now ?? new Date();
  const profile = await requireProfile(db, userId);
  const todayLocal = localDateOf(now, profile.time_zone);
  const gamification = await loadGamificationContext(db, userId, todayLocal, { ...extras, profile });
  return { profile, todayLocal, now: now.toISOString(), gamification };
}
