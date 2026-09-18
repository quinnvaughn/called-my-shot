import { type StreakFamilyValue, streakFamilyParam } from "#/lib/streak-meta"
import type { Target } from "./notification-shell"

// Streak and sweep notifications are only ever about the viewer's own record,
// so they open the viewer's own page. Null (no link) if any part is missing:
// a league deleted since, or a session that hasn't loaded the viewer yet.

export function streakTarget(
	username: string | undefined,
	leagueSlug: string | undefined,
	family: StreakFamilyValue | null | undefined,
): Target {
	if (!username || !leagueSlug || !family) return null
	return {
		to: "/user/$username/streaks/$league/$family/$mode",
		params: {
			username,
			league: leagueSlug,
			family: streakFamilyParam(family),
			// Every achievement notification is about a run, never a cold one.
			mode: "hot",
		},
	}
}

export function sweepTarget(
	username: string | undefined,
	leagueSlug: string | undefined,
	slateKey: string | null | undefined,
): Target {
	if (!username || !leagueSlug || !slateKey) return null
	return {
		to: "/user/$username/sweeps/$league/$slateKey",
		params: { username, league: leagueSlug, slateKey },
	}
}
