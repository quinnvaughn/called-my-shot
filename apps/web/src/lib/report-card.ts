import { type Grade, REPORT_CARD_MIN_SETTLED } from "@called-my-shot/scoring"
import { match, P } from "ts-pattern"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { pluralize } from "#/lib/pluralize"

// Every number the card shows is rounded here and only here. The API sends
// returnPct unrounded on purpose so the page and its og:image can't round
// differently and disagree by a point.
export function formatReturn(returnPct: number | null): string | null {
	if (returnPct === null) return null
	const rounded = Math.round(returnPct)
	return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded)}%`
}

// Green above break-even, red below, neutral at C. Break-even is where the
// loss rates are tuned to put an average caller, so C genuinely is the
// "nothing happened here" grade and shouldn't be colored like a result.
export function gradeTone(grade: string | null): string {
	return match(grade as Grade | null)
		.with("A+", "A", "B", () => "success.default")
		.with("C", () => "fg.default")
		.with("D", "F", () => "danger.default")
		.otherwise(() => "fg.muted")
}

export function returnTone(returnPct: number | null): string {
	if (returnPct === null) return "fg.muted"
	if (returnPct > 0) return "success.default"
	if (returnPct < 0) return "danger.default"
	return "fg.default"
}

export type ReportCardStatus = {
	settledCount: number
	pendingCount: number
	pendingStake: number
	isFinal: boolean
	grade: string | null
}

// The line under the tiles. It answers the question the card raises while a
// slate is still running - "is this the final number?" - and says what is
// still out there rather than restating the record above it.
export function reportCardStatusLine(card: ReportCardStatus): string | null {
	return (
		match(card)
			.with({ settledCount: 0, pendingCount: 0 }, () => null)
			.with(
				{ pendingCount: P.number.gt(0) },
				({ pendingCount, pendingStake }) =>
					`${pendingCount} still out there · ${pendingStake} at risk`,
			)
			.with({ isFinal: true, grade: P.string }, () => null)
			// Settled out, but under the sample floor, so there's no letter. Says
			// how many more would earn one rather than leaving a blank tile
			// unexplained - the same "N more to unlock" shape conviction edge uses.
			.with({ isFinal: true }, ({ settledCount }) => {
				const needed = REPORT_CARD_MIN_SETTLED - settledCount
				return needed > 0
					? `${needed} more ${pluralize(needed, "result", "results")} to grade`
					: null
			})
			.otherwise(() => null)
	)
}

// Whether there is anything to render at all. A window the viewer sat out
// still comes back as a card (it carries the window's label, which the
// permalink needs to say what it found nothing for) - the inline card on the
// Games tab just doesn't draw it.
export function isEmptyReportCard(card: {
	settledCount: number
	pendingCount: number
}): boolean {
	return card.settledCount + card.pendingCount === 0
}

export function reportCardPath(
	username: string,
	leagueSlug: string,
	windowKey: string,
): string {
	return `/user/${username}/report-cards/${leagueSlug}/${windowKey}`
}

export type ReportCardFacts = {
	username: string
	// "NFL WEEK 3"
	track: string
	wins: number
	losses: number
	netPoints: number
	committedPoints: number
	returnPct: number | null
	grade: string | null
	isFinal: boolean
}

// What an unfurled link and a browser tab say about a window. Hedged with
// "so far" until every call in it has settled, so a link shared on Sunday
// afternoon doesn't read as a final verdict.
export function reportCardPageMeta(facts: ReportCardFacts): {
	title: string
	description: string
} {
	const qualifier = facts.isFinal ? "" : " so far"
	const grade = facts.grade ? `${facts.grade} · ` : ""
	const description = [
		`${formatRecord(facts.wins, facts.losses)}${qualifier}`,
		`${formatSignedPoints(facts.netPoints)} pts`,
		formatReturn(facts.returnPct)
			? `${formatReturn(facts.returnPct)} on ${facts.committedPoints} committed`
			: null,
	]
		.filter((part) => part !== null)
		.join(" · ")
	return {
		title: `@${facts.username}'s ${facts.track} Report Card`,
		description: `${grade}${description}.`,
	}
}

export function buildReportCardTweet(
	facts: ReportCardFacts & { isOwn: boolean },
): string {
	const line = facts.grade
		? `${facts.grade}. ${formatRecord(facts.wins, facts.losses)} for ${formatSignedPoints(facts.netPoints)}.`
		: `${formatRecord(facts.wins, facts.losses)} for ${formatSignedPoints(facts.netPoints)}.`
	return facts.isOwn
		? `My ${facts.track} Report Card: ${line}`
		: `@${facts.username}'s ${facts.track} Report Card: ${line}`
}

// Changes whenever a number on the og:image does, so an unfurl cache holding
// an older render is handed a url it has never scraped. A report card moves
// as a slate settles, unlike a sweep, so this has to cover the pending count
// too - not just the final figures.
export function reportCardVersion(input: {
	grade: string | null
	wins: number
	losses: number
	netPoints: number
	pendingCount: number
}): string {
	return [
		input.grade ?? "ungraded",
		input.wins,
		input.losses,
		input.netPoints,
		input.pendingCount,
	].join("-")
}
