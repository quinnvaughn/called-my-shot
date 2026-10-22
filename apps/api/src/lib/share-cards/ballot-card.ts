// The og:image behind /ballots/:slug/:username. It states how much of the
// ballot someone has called and, once members settle, their record and
// points. A win-totals ballot with three picks in every conference also
// shows the best records it projects in each, side by side - the one part of
// a ballot that says something about its owner at preview size. Everything
// else about the picks is on the page the link opens.
//
// Built on the shared og:image frame (see frame.ts).
import { and, asc, eq, gt } from "drizzle-orm"
import { db } from "../../db"
import { LEAGUE_SEASON_FORMAT } from "../../db/catalog/league-season-format"
import { ballotQuestions, questions } from "../../db/schema"
import { type BallotEntry, loadBallotEntry } from "../ballot-entry"
import { loadTiebreakPositions } from "../ballot-tiebreaks"
import { COLOR } from "../brand-palette"
import { el, image, type SatoriNode } from "../share-image"
import { formatCallDate } from "./call-summary"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"
import { logoDataUri } from "./team-logo"

// Same measurements as call-card.ts's pick label, which sits in the same slot
// at the same sizes.
const NAME_HERO_MAX = 22
const NAME_MAX = 42

// How many teams each conference shows on a win-totals card.
const TOP_PER_CONFERENCE = 3
const LOGO_PX = 52

export type StandingsCardTeam = {
	abbreviation: string
	color: string
	// A data URI, fetched ahead of render so a slow or missing logo can't
	// fail the whole image. Null falls back to a pill in the team's color.
	logo: string | null
	wins: number
	// Null where the league's standings don't count losses the same way
	// (NHL overtime losses).
	losses: number | null
}

export type StandingsCardData = {
	conferences: { label: string; teams: StandingsCardTeam[] }[]
}

export type BallotShareCardData = {
	ballotName: string
	leagueAbbr: string
	name: string
	username: string
	calledCount: number
	memberCount: number
	wins: number
	losses: number
	points: number
	// "Locks Sep 14, 2026" / "Awaiting results" - shown in place of the record
	// and points while nothing has settled.
	pendingLabel: string
	// A win-totals ballot's best projected records. Null for any other
	// ballot, or one without three picks in every conference yet.
	standings?: StandingsCardData | null
}

export function buildBallotShareCard(data: BallotShareCardData): SatoriNode {
	const hasSettled = data.wins + data.losses > 0
	const ballotName = clamp(data.ballotName, NAME_MAX)

	const cells: SatoriNode[] = [
		statCell("Called", `${data.calledCount} of ${data.memberCount}`),
	]
	if (hasSettled) {
		const up = data.points >= 0
		cells.push(statCell("Record", `${data.wins}–${data.losses}`))
		cells.push(
			statCell("Points", `${up ? "+" : "−"}${Math.abs(data.points)}`, {
				color: up ? COLOR.success : COLOR.danger,
				big: true,
			}),
		)
	} else {
		cells.push(statCell("Status", data.pendingLabel, { color: COLOR.dim }))
	}

	if (data.standings) {
		return cardFrame({
			eyebrow: `${data.leagueAbbr} · ${ballotName}`,
			hero: standingsHero(data.name, data.standings),
			cells,
			username: data.username,
		})
	}

	return cardFrame({
		eyebrow: `${data.leagueAbbr} · Ballot`,
		hero: el(
			"div",
			{
				display: "flex",
				flexDirection: "column",
				flex: "1",
				overflow: "hidden",
				alignItems: "center",
				justifyContent: "center",
				gap: "10px",
				paddingLeft: "48px",
				paddingRight: "48px",
			},
			[
				eyebrow(
					`${clamp(data.name, PERSON_MAX)}'s picks`,
					COLOR.primaryDefault,
				),
				el(
					"span",
					{
						display: "flex",
						fontFamily: "Archivo Black",
						fontSize: ballotName.length <= NAME_HERO_MAX ? "68px" : "44px",
						lineHeight: 1.1,
						textAlign: "center",
						color: COLOR.ink,
					},
					ballotName,
				),
			],
		),
		cells,
		username: data.username,
	})
}

function teamMark(team: StandingsCardTeam): SatoriNode {
	if (team.logo) {
		return image(team.logo, LOGO_PX, LOGO_PX, { objectFit: "contain" })
	}
	return el(
		"span",
		{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			width: `${LOGO_PX}px`,
			height: `${LOGO_PX}px`,
			borderRadius: "10px",
			backgroundColor: team.color,
		},
		[],
	)
}

function standingsRow(team: StandingsCardTeam, rank: number): SatoriNode {
	return el(
		"div",
		{ display: "flex", alignItems: "center", gap: "16px", width: "100%" },
		[
			el(
				"span",
				{
					display: "flex",
					width: "20px",
					fontFamily: "Space Mono",
					fontSize: "20px",
					color: COLOR.dim,
				},
				String(rank),
			),
			teamMark(team),
			el(
				"span",
				{
					display: "flex",
					flex: "1",
					fontFamily: "Archivo Black",
					fontSize: "34px",
					color: COLOR.ink,
				},
				team.abbreviation,
			),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Space Mono",
					fontWeight: 700,
					fontSize: "28px",
					color: COLOR.ink,
				},
				team.losses === null ? `${team.wins} W` : `${team.wins}-${team.losses}`,
			),
		],
	)
}

function standingsHero(name: string, standings: StandingsCardData): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			flexDirection: "column",
			flex: "1",
			overflow: "hidden",
			justifyContent: "center",
			gap: "18px",
			paddingLeft: "48px",
			paddingRight: "48px",
		},
		[
			eyebrow(
				`${clamp(name, PERSON_MAX)}'s projected standings`,
				COLOR.primaryDefault,
			),
			el(
				"div",
				{ display: "flex", gap: "56px", width: "100%" },
				standings.conferences.map((conference) =>
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							flex: "1",
							gap: "12px",
						},
						[
							eyebrow(conference.label),
							...conference.teams.map((team, i) => standingsRow(team, i + 1)),
						],
					),
				),
			),
		],
	)
}

// The best few records in each conference on a win-totals ballot, in the
// order the standings view puts them: wins, then the owner's order for teams
// on the same total, then name. Needs a full top in every conference; teams
// not picked yet are left out. Null for anything else.
async function loadStandingsCard(
	leagueSlug: string,
	userId: string,
	entry: BallotEntry,
): Promise<StandingsCardData | null> {
	const format = LEAGUE_SEASON_FORMAT[leagueSlug]
	if (!format) return null

	const questionIds = entry.members.map((m) => m.member.questionId)
	const [rows, positions] = await Promise.all([
		db.query.questions.findMany({
			where: { id: { in: questionIds } },
			columns: { id: true, shape: true },
			with: {
				stat: { columns: { name: true } },
				subjectTeam: true,
			},
		}),
		loadTiebreakPositions(userId, questionIds),
	])
	const questionById = new Map(rows.map((q) => [q.id, q]))

	const picks: {
		team: NonNullable<(typeof rows)[number]["subjectTeam"]>
		wins: number
		position: number | null
	}[] = []
	for (const { member, call } of entry.members) {
		const question = questionById.get(member.questionId)
		const team = question?.subjectTeam
		if (
			question?.shape !== "team_season_stat_numeric_guess" ||
			question.stat?.name !== "Wins" ||
			!team?.conference
		) {
			return null
		}
		if (call?.guessValue == null) continue
		picks.push({
			team,
			wins: call.guessValue,
			position: positions.get(member.questionId) ?? null,
		})
	}

	const conferenceNames = new Set(
		rows.map((q) => q.subjectTeam?.conference ?? ""),
	)
	const conferences = [...conferenceNames]
		.sort((a, b) => a.localeCompare(b))
		.map((label) => ({
			label,
			top: picks
				.filter((p) => p.team.conference === label)
				.sort((a, b) => {
					if (a.wins !== b.wins) return b.wins - a.wins
					if (a.position !== b.position) {
						if (a.position === null) return 1
						if (b.position === null) return -1
						return a.position - b.position
					}
					return a.team.name.localeCompare(b.team.name)
				})
				.slice(0, TOP_PER_CONFERENCE),
		}))

	if (conferences.some(({ top }) => top.length < TOP_PER_CONFERENCE)) {
		return null
	}

	// The NHL counts overtime losses apart, so its records stand on wins
	// alone, as in the standings view.
	const showLosses = leagueSlug !== "nhl"
	return {
		conferences: await Promise.all(
			conferences.map(async ({ label, top }) => ({
				label,
				teams: await Promise.all(
					top.map(async (p) => ({
						abbreviation: p.team.abbreviation,
						color: p.team.color,
						logo: await logoDataUri(p.team.logoUrl),
						wins: p.wins,
						losses: showLosses ? format.gamesPerSeason - p.wins : null,
					})),
				),
			})),
		),
	}
}

// Null for an unknown or unpublished ballot, an unknown user, or a user with
// no entry on it.
export async function loadBallotShareCardData(
	ballotSlug: string,
	username: string,
): Promise<BallotShareCardData | null> {
	const [ballot, user] = await Promise.all([
		db.query.ballots.findFirst({
			where: { slug: ballotSlug, status: "published" },
			with: { league: { columns: { abbreviation: true, slug: true } } },
		}),
		db.query.users.findFirst({ where: { username } }),
	])
	const entry =
		ballot && user ? await loadBallotEntry(ballot.id, user.id) : null
	if (!ballot?.league || !user || !entry) return null

	const [nextLock] = await db
		.select({ locksAt: questions.locksAt })
		.from(ballotQuestions)
		.innerJoin(questions, eq(questions.id, ballotQuestions.questionId))
		.where(
			and(
				eq(ballotQuestions.ballotId, ballot.id),
				gt(questions.locksAt, new Date()),
			),
		)
		.orderBy(asc(questions.locksAt))
		.limit(1)

	const standings = await loadStandingsCard(ballot.league.slug, user.id, entry)

	return {
		standings,
		ballotName: ballot.name,
		leagueAbbr: ballot.league.abbreviation.toUpperCase(),
		name: user.name,
		username: user.username,
		calledCount: entry.calledCount,
		memberCount: entry.members.length,
		wins: entry.wins,
		losses: entry.losses,
		points: entry.points,
		pendingLabel: nextLock
			? `Locks ${formatCallDate(nextLock.locksAt)}`
			: "Awaiting results",
	}
}
