import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"

// Everything a streak or sweep page, its share row and its og:image url say
// in words. The og:image itself is apps/api's share-cards/streak-card.ts and
// sweep-card.ts; these state the same numbers.

export type StreakFamilyValue =
	| "WINNERS"
	| "TEAM_STATS"
	| "PLAYER_STATS"
	| "NUMERIC"

const FAMILY_BY_PARAM: Record<string, StreakFamilyValue> = {
	winners: "WINNERS",
	team_stats: "TEAM_STATS",
	player_stats: "PLAYER_STATS",
	numeric: "NUMERIC",
}

// The url carries the family lowercase ("player_stats"), matching the api's own
// share route.
export function parseStreakFamilyParam(
	param: string,
): StreakFamilyValue | null {
	return FAMILY_BY_PARAM[param] ?? null
}

export function streakFamilyParam(family: StreakFamilyValue): string {
	return family.toLowerCase()
}

export function streakPath(
	username: string,
	leagueSlug: string,
	family: StreakFamilyValue,
): string {
	return `/user/${username}/streaks/${leagueSlug}/${streakFamilyParam(family)}`
}

export function sweepPath(
	username: string,
	leagueSlug: string,
	slateKey: string,
): string {
	return `/user/${username}/sweeps/${leagueSlug}/${slateKey}`
}

// 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st.
export function ordinal(n: number): string {
	const mod100 = n % 100
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`
	const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th"
	return `${n}${n % 10 > 3 ? "th" : suffix}`
}

// What the viewer's live streak has riding on an open question they haven't
// called yet. A run already at its best is one win from a new one; any other
// run can only be ended by this call.
export function streakStakeText(stake: {
	// "NFL Player Stats"
	track: string
	currentLength: number
	bestLength: number
}): string {
	const lead = `You're ${stake.currentLength} in a row on ${stake.track}.`
	return stake.currentLength === stake.bestLength
		? `${lead} One more sets your best.`
		: `${lead} A miss ends it.`
}

// A nudge toward the next streak notification, which fires at every multiple
// of STREAK_MILESTONE_STEP. Null unless a live run is one or two calls from
// it.
export function milestoneNudge(
	currentLength: number,
	nextMilestone: number,
): string | null {
	const toGo = nextMilestone - currentLength
	if (currentLength <= 0 || toGo < 1 || toGo > 2) return null
	return toGo === 1
		? `One more for ${nextMilestone} in a row.`
		: `2 more for ${nextMilestone} in a row.`
}

// Same split as buildCallTweet: first person only on your own page, since a
// streak or sweep page is public and anyone can share anyone's.
type TweetAuthor = { isOwn: true } | { isOwn: false; username: string }

type StreakFacts = {
	// "NFL Player Stats"
	track: string
	currentLength: number
	bestLength: number
}

// A run still going is the brag. Once it has ended, the best run is what's
// left to state, and it's named as a best so nobody reads it as live.
export function buildStreakTweet(streak: StreakFacts & TweetAuthor): string {
	const { track, currentLength: current, bestLength: best } = streak
	if (current > 0) {
		const lead = streak.isOwn
			? `${current} in a row on ${track}.`
			: `@${streak.username} is ${current} in a row on ${track}.`
		if (best <= current) return lead
		return `${lead} ${streak.isOwn ? "My best" : "Best"} is ${best}.`
	}
	return streak.isOwn
		? `My best on ${track}: ${best} in a row.`
		: `@${streak.username}'s best on ${track}: ${best} in a row.`
}

export function streakPageMeta(
	input: StreakFacts & {
		username: string
		// Pre-formatted by formatCallDate.
		runStartedAt: string | null
	},
): { title: string; description: string } {
	const who = `@${input.username}`
	const title =
		input.currentLength > 0
			? `${who} is ${input.currentLength} in a row on ${input.track}`
			: `${who}'s best on ${input.track}: ${input.bestLength} in a row`
	const description = [
		input.currentLength > 0
			? `${input.currentLength} in a row`
			: "No current run",
		`Best run of ${input.bestLength}`,
		input.runStartedAt ? `Run started ${input.runStartedAt}` : null,
	]
		.filter((part) => part !== null)
		.join(" · ")
	return { title, description: `${description}.` }
}

// Changes whenever a number on the streak card does. The last hit is named by
// its call, so a run that resets and climbs back to the same length is still
// a new url.
export function streakCardVersion(input: {
	currentLength: number
	bestLength: number
	lastHitCallId: string | null
}): string {
	return `${input.currentLength}-${input.bestLength}-${input.lastHitCallId?.slice(0, 8) ?? "none"}`
}

type SweepFacts = {
	// "NFL Week 3 Sunday Early"
	track: string
	gameCount: number
}

export function buildSweepTweet(sweep: SweepFacts & TweetAuthor): string {
	const tally = `${sweep.gameCount} for ${sweep.gameCount}.`
	return sweep.isOwn
		? `Picked every ${sweep.track} winner. ${tally}`
		: `@${sweep.username} picked every ${sweep.track} winner. ${tally}`
}

export function sweepPageMeta(
	input: SweepFacts & {
		username: string
		// Null until every swept call's points are final.
		points: number | null
		dates: string
	},
): { title: string; description: string } {
	const n = input.gameCount
	const description = [
		`${n} games`,
		formatRecord(n, 0),
		input.points !== null ? `${formatSignedPoints(input.points)} pts` : null,
		input.dates,
	]
		.filter((part) => part !== null)
		.join(" · ")
	return {
		title: `@${input.username} picked every ${input.track} winner: ${n} for ${n}`,
		description: `${description}.`,
	}
}

export function sweepCardVersion(input: {
	gameCount: number
	points: number | null
}): string {
	return `${input.gameCount}-${input.points ?? "pending"}`
}

// "Sep 14, 2026", "Sep 14 to 15, 2026", "Sep 30 to Oct 1, 2026". Mirrors
// formatSlateDates in apps/api's share-cards/sweep-card.ts, which prints the
// same dates onto the og:image, and is pinned to the sports zone and en-US
// for the same hydration reasons as formatCallDate.
export function formatSlateDates(isoStarts: string[]): {
	text: string
	multiDay: boolean
} {
	const days = isoStarts
		.map((iso) =>
			DateTime.fromISO(iso, { zone: SPORTS_TIME_ZONE })
				.setLocale("en-US")
				.startOf("day"),
		)
		.sort((a, b) => a.toMillis() - b.toMillis())
	const first = days[0]
	const last = days[days.length - 1]
	if (!first || !last) return { text: "-", multiDay: false }
	if (first.hasSame(last, "day")) {
		return { text: first.toFormat("MMM d, yyyy"), multiDay: false }
	}
	const end = first.hasSame(last, "month")
		? last.toFormat("d, yyyy")
		: last.toFormat("MMM d, yyyy")
	const start = first.hasSame(last, "year")
		? first.toFormat("MMM d")
		: first.toFormat("MMM d, yyyy")
	return { text: `${start} to ${end}`, multiDay: true }
}
