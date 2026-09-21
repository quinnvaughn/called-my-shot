// The og:image behind /user/:username/sweeps/:league/:slateKey. It states a
// slate where someone picked every winner: how many games, which side they
// took in each, and the points it earned.
//
// Built on the shared og:image frame (see frame.ts).
import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { inArray } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../db"
import { callSelections } from "../../db/schema"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { canonicalWinnerQuestion } from "../streaks/compute"
import { loadSlateGames } from "../streaks/recompute"
import { formatSlateLabel, parseSlateKey } from "../streaks/slate"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

const SLATE_LABEL_MAX = 36

// Above this many games the chips and the hero both step down a size, so a
// full MLB day (15 or 16 games) wraps to two rows of chips and still fits
// the hero band beside its heading. Below it, the chips get room to be read.
const COMPACT_ABOVE = 8

export type SweepGameChip = {
	away: string
	home: string
	picked: "away" | "home" | null
}

export type SweepShareCardData = {
	leagueAbbr: string
	// "Week 3 Sunday Early", "Sep 14" - see formatSlateLabel.
	slateLabel: string
	name: string
	username: string
	// Kickoff order. Every counted game gets a chip; none are dropped to fit.
	games: SweepGameChip[]
	// Null until every swept call's points are final.
	points: number | null
	// "Sep 14, 2026", or a range for a slate that spans days.
	dates: string
	multiDay: boolean
}

function team(abbr: string, picked: boolean, compact: boolean): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			paddingLeft: compact ? "6px" : "8px",
			paddingRight: compact ? "6px" : "8px",
			paddingTop: "2px",
			paddingBottom: "2px",
			borderRadius: "6px",
			fontWeight: picked ? 700 : 400,
			color: picked ? COLOR.success : COLOR.dim,
			backgroundColor: picked ? COLOR.successSubtle : "transparent",
		},
		abbr,
	)
}

function gameChip(game: SweepGameChip, compact: boolean): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			alignItems: "center",
			gap: "4px",
			paddingLeft: "6px",
			paddingRight: "6px",
			paddingTop: "6px",
			paddingBottom: "6px",
			border: `1px solid ${COLOR.border}`,
			borderRadius: "10px",
			backgroundColor: COLOR.cardMuted,
			fontFamily: "Space Mono",
			fontSize: compact ? "18px" : "22px",
		},
		[
			team(game.away, game.picked === "away", compact),
			el("span", { display: "flex", color: COLOR.dim }, "@"),
			team(game.home, game.picked === "home", compact),
		],
	)
}

export function buildSweepShareCard(data: SweepShareCardData): SatoriNode {
	const n = data.games.length
	const compact = n > COMPACT_ABOVE

	const cells: SatoriNode[] = [
		statCell("Games", String(n)),
		statCell("Record", `${n}–0`),
	]
	// Every call in a sweep won, and a winning pick never scores below zero.
	if (data.points !== null) {
		cells.push(
			statCell("Points", `+${data.points}`, {
				color: COLOR.success,
				big: true,
			}),
		)
	}
	cells.push(statCell(data.multiDay ? "Dates" : "Date", data.dates))

	return cardFrame({
		eyebrow: `${data.leagueAbbr} · ${clamp(data.slateLabel, SLATE_LABEL_MAX)} sweep`,
		// The chip row wraps rather than clamping, and the compact sizes above
		// are what keep a full slate inside this band.
		hero: el(
			"div",
			{
				display: "flex",
				flexDirection: "column",
				flex: "1",
				overflow: "hidden",
				alignItems: "center",
				justifyContent: "center",
				gap: compact ? "10px" : "14px",
				paddingLeft: "36px",
				paddingRight: "36px",
			},
			[
				eyebrow(clamp(data.name, PERSON_MAX)),
				el(
					"span",
					{
						display: "flex",
						fontFamily: "Archivo Black",
						fontSize: compact ? "84px" : "112px",
						lineHeight: 1,
						color: COLOR.ink,
					},
					`${n} for ${n}`,
				),
				el(
					"div",
					{
						display: "flex",
						flexWrap: "wrap",
						justifyContent: "center",
						gap: compact ? "8px" : "12px",
						width: "100%",
					},
					data.games.map((game) => gameChip(game, compact)),
				),
			],
		),
		cells,
		username: data.username,
	})
}

// "Sep 14, 2026", "Sep 14 to 15, 2026", "Sep 30 to Oct 1, 2026". Pinned to
// the sports zone and en-US for the same reasons as formatCallDate.
export function formatSlateDates(starts: Date[]): {
	text: string
	multiDay: boolean
} {
	const days = starts
		.map((d) =>
			DateTime.fromJSDate(d, { zone: SPORTS_TIME_ZONE })
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

// Null when the sweep doesn't exist: an unknown user, league or slate, or
// one an overturn has since taken away.
export async function loadSweepShareCardData(
	username: string,
	leagueSlug: string,
	slateKey: string,
): Promise<SweepShareCardData | null> {
	const slate = parseSlateKey(slateKey)
	if (!slate) return null
	const [user, league] = await Promise.all([
		db.query.users.findFirst({ where: { username } }),
		db.query.leagues.findFirst({ where: { slug: leagueSlug } }),
	])
	if (!user || !league) return null

	const sweep = await db.query.userSweeps.findFirst({
		where: { userId: user.id, leagueId: league.id, slateKey },
	})
	if (!sweep) return null

	// Same game set and canonical question as the sweep's own rebuild
	// (recomputeSlate), so the chips are exactly the games it counted.
	const slateGames = await loadSlateGames(db, league.id, slate)
	const counted = slateGames.flatMap((game) => {
		const question = canonicalWinnerQuestion(
			league.slug,
			game.id,
			game.questions,
		)
		if (!question || question.status === "voided") return []
		const call = question.calls.find((c) => c.userId === user.id)
		if (!call) return []
		const pickedTeamId = call.selections[0]?.option?.teamId ?? null
		const picked: SweepGameChip["picked"] =
			pickedTeamId === game.awayTeamId
				? "away"
				: pickedTeamId === game.homeTeamId
					? "home"
					: null
		return [
			{ gameId: game.id, startsAt: game.startsAt, callId: call.id, picked },
		]
	})
	if (counted.length === 0) return null

	const [teamRows, selections] = await Promise.all([
		db.query.games.findMany({
			where: { id: { in: counted.map((c) => c.gameId) } },
			columns: { id: true },
			with: {
				homeTeam: { columns: { abbreviation: true } },
				awayTeam: { columns: { abbreviation: true } },
			},
		}),
		db
			.select({ resultPoints: callSelections.resultPoints })
			.from(callSelections)
			.where(
				inArray(
					callSelections.callId,
					counted.map((c) => c.callId),
				),
			),
	])
	const teamsByGame = new Map(teamRows.map((row) => [row.id, row]))
	const points = selections.some((row) => row.resultPoints === null)
		? null
		: selections.reduce((sum, row) => sum + (row.resultPoints ?? 0), 0)
	const dates = formatSlateDates(counted.map((c) => c.startsAt))

	return {
		leagueAbbr: league.abbreviation.toUpperCase(),
		slateLabel: formatSlateLabel(slate, league.slug),
		name: user.name,
		username: user.username,
		games: counted.map((c) => {
			const teams = teamsByGame.get(c.gameId)
			return {
				away: teams?.awayTeam?.abbreviation ?? "?",
				home: teams?.homeTeam?.abbreviation ?? "?",
				picked: c.picked,
			}
		}),
		points,
		dates: dates.text,
		multiDay: dates.multiDay,
	}
}
