import { db } from "../db"
import type { Season } from "../db/schema"

// "Current" for a league = the season actually in progress right now
// (regular season through its postseason, if it has one), or if none is in
// progress, the soonest upcoming one, or if nothing upcoming has synced yet,
// the most recently completed one. Deliberately not just "latest
// regularSeasonStartsAt <= now" - that rule alone would call a season whose
// postseason has already fully wrapped "current" for the entire gap before
// the next one starts (e.g. NBA's summer offseason, months long).
export async function getCurrentSeason(leagueId: string): Promise<Season | null> {
	const rows = await db.query.seasons.findMany({ where: { leagueId } })
	if (rows.length === 0) return null

	const now = new Date()
	const inProgress = rows.find(
		(s) =>
			s.regularSeasonStartsAt <= now &&
			now <= (s.postseasonEndsAt ?? s.regularSeasonEndsAt),
	)
	if (inProgress) return inProgress

	const upcoming = rows
		.filter((s) => s.regularSeasonStartsAt > now)
		.sort(
			(a, b) => a.regularSeasonStartsAt.getTime() - b.regularSeasonStartsAt.getTime(),
		)[0]
	if (upcoming) return upcoming

	// Nothing in progress, nothing upcoming synced - fall back to the most
	// recently completed one rather than null, so a lagging sync doesn't leave
	// every game-less question without a season.
	return (
		rows.sort(
			(a, b) => b.regularSeasonStartsAt.getTime() - a.regularSeasonStartsAt.getTime(),
		)[0] ?? null
	)
}
