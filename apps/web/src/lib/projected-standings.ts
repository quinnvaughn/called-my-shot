import { match } from "ts-pattern"

// A win-totals ballot read back as the standings it implies. Every rule here
// is the league's real playoff format applied to one wins number per team.
// A single wins number can't feed head-to-head or division record, so teams
// on the same total stand in the order the user put them in, alphabetical
// until they move one.

export type StandingsTeamInput = {
	questionId: string
	name: string
	abbreviation: string
	color: string
	logoUrl: string | null
	conference: string | null
	division: string | null
	// Null when the user hasn't picked this team.
	wins: number | null
	tiebreakPosition: number | null
	conviction: number | null
	// The call a row links to. Null links the team's question instead: an
	// unpicked team, or the viewer's own ballot page, where the question is
	// where a pick gets made or changed.
	callId: string | null
}

// How a league turns a conference's order into a playoff field.
type LeagueFormat =
	// NFL, MLB: each division's leader is seeded first, ordered by wins, then
	// the best of the rest fill the wild cards. The top `byes` seeds skip the
	// first round.
	| { kind: "divisionWinners"; wildCards: number; byes: number }
	// NBA: straight conference order, top `playoffSpots` in, the next few
	// through `playInThrough` to the play-in.
	| { kind: "conference"; playoffSpots: number; playInThrough: number }
	// NHL: the top `perDivision` of each division, then `wildCards` of
	// whoever's left in the conference.
	| { kind: "divisionTop"; perDivision: number; wildCards: number }

type League = {
	format: LeagueFormat
	conferenceLabel: (conference: string) => string
	// False for the NHL, where a loss column would fold overtime losses (a
	// point each in the real standings) in with regulation ones.
	showLosses: boolean
}

const conferenceByDirection = (conference: string) =>
	match(conference)
		.with("East", () => "Eastern Conference")
		.with("West", () => "Western Conference")
		.otherwise(() => conference)

export function leagueStandingsRules(leagueSlug: string): League | null {
	return match(leagueSlug)
		.returnType<League | null>()
		.with("nfl", () => ({
			format: { kind: "divisionWinners", wildCards: 3, byes: 1 },
			conferenceLabel: (c) => c,
			showLosses: true,
		}))
		.with("mlb", () => ({
			format: { kind: "divisionWinners", wildCards: 3, byes: 2 },
			conferenceLabel: (c) =>
				match(c)
					.with("AL", () => "American League")
					.with("NL", () => "National League")
					.otherwise(() => c),
			showLosses: true,
		}))
		.with("nba", () => ({
			format: { kind: "conference", playoffSpots: 6, playInThrough: 10 },
			conferenceLabel: conferenceByDirection,
			showLosses: true,
		}))
		.with("nhl", () => ({
			format: { kind: "divisionTop", perDivision: 3, wildCards: 2 },
			conferenceLabel: conferenceByDirection,
			showLosses: false,
		}))
		.otherwise(() => null)
}

// Where a team's season ends up. Null until every team in the conference is
// picked, since the field can't be set before then.
export type StandingsStatus = "bye" | "playoff" | "playIn" | "out"

export type StandingsRow = {
	team: StandingsTeamInput
	wins: number | null
	losses: number | null
	// Place within its section. Null for an unpicked team.
	rank: number | null
	// "1", or "WC1" for an NHL wild card. Null outside the field.
	seed: string | null
	status: StandingsStatus | null
	// The neighbouring row is on the same win total, so the two can trade
	// places. Every section is a slice of one conference order, which is
	// what makes that always a real change to the table.
	canMoveUp: boolean
	canMoveDown: boolean
}

export type StandingsSection = {
	// Stable across reorders, unlike the rows.
	key: string
	label: string
	rows: StandingsRow[]
	// A line drawn under the row at each index.
	lines: { after: number; label: string }[]
}

export type ConferenceStandings = {
	conference: string
	label: string
	sections: StandingsSection[]
	// Why seeds aren't shown for this conference, when they aren't.
	seedsNote: string | null
}

export type ProjectedStandings = {
	conferences: ConferenceStandings[]
	showLosses: boolean
	projectedWins: number
	// What every team's wins add up to over a real season: one per game.
	leagueWins: number
	pickedCount: number
	teamCount: number
}

// Wins, then the user's order among teams on the same total, then name. A
// position is only ever compared against teams on the same total, so one
// left behind by a pick that has since changed can't move anything.
function compareInConference(a: StandingsTeamInput, b: StandingsTeamInput) {
	if (a.wins !== b.wins) return (b.wins ?? -1) - (a.wins ?? -1)
	const pa = a.tiebreakPosition
	const pb = b.tiebreakPosition
	if (pa !== pb) {
		if (pa === null) return 1
		if (pb === null) return -1
		return pa - pb
	}
	return a.name.localeCompare(b.name)
}

// The full order of the teams on `movingId`'s total in its conference, with
// it moved just past `targetId` - what gets saved when a row trades places
// with its neighbour. A team on the same total in another division can sit
// between the two in conference order; the moved team passes it too, and
// everyone else keeps their order.
export function tiebreakOrderAfterMove(
	teams: StandingsTeamInput[],
	movingId: string,
	targetId: string,
): string[] {
	const moving = teams.find((t) => t.questionId === movingId)
	if (!moving) return []
	const order = teams
		.filter((t) => t.conference === moving.conference && t.wins === moving.wins)
		.sort(compareInConference)
		.map((t) => t.questionId)
	const wasAbove = order.indexOf(movingId) < order.indexOf(targetId)
	const rest = order.filter((id) => id !== movingId)
	const target = rest.indexOf(targetId)
	rest.splice(wasAbove ? target + 1 : target, 0, movingId)
	return rest
}

// Conference, then division, the same way teamSectionResolver labels a
// ballot's sections: the bare division name unless another conference has
// one by the same name ("AFC East").
function divisionLabels(teams: StandingsTeamInput[]) {
	const conferencesByDivision = new Map<string, Set<string>>()
	for (const team of teams) {
		if (!team.division || !team.conference) continue
		const set = conferencesByDivision.get(team.division) ?? new Set<string>()
		set.add(team.conference)
		conferencesByDivision.set(team.division, set)
	}
	return (conference: string, division: string) =>
		(conferencesByDivision.get(division)?.size ?? 0) > 1
			? `${conference} ${division}`
			: division
}

type Placement = { seed: string | null; status: StandingsStatus }

function buildConference(
	conference: string,
	teams: StandingsTeamInput[],
	rules: League,
	gamesPerSeason: number,
	divisionLabel: (conference: string, division: string) => string,
): ConferenceStandings {
	const picked = teams.filter((t) => t.wins !== null).sort(compareInConference)
	const unpicked = teams
		.filter((t) => t.wins === null)
		.sort((a, b) => a.name.localeCompare(b.name))
	const complete = unpicked.length === 0
	const label = rules.conferenceLabel(conference)

	const divisionNames = [
		...new Set(teams.map((t) => t.division).filter((d) => d !== null)),
	].sort((a, b) => a.localeCompare(b))
	const inDivision = (list: StandingsTeamInput[], division: string) =>
		list.filter((t) => t.division === division)

	const placement = new Map<StandingsTeamInput, Placement>()
	const place = (
		list: StandingsTeamInput[],
		status: (i: number) => StandingsStatus,
		seed: (i: number) => string | null,
	) => {
		for (const [i, team] of list.entries()) {
			placement.set(team, { seed: seed(i), status: status(i) })
		}
	}

	const row = (team: StandingsTeamInput, i: number): StandingsRow => ({
		team,
		wins: team.wins,
		losses: team.wins === null ? null : gamesPerSeason - team.wins,
		rank: team.wins === null ? null : i + 1,
		seed: placement.get(team)?.seed ?? null,
		status: placement.get(team)?.status ?? null,
		canMoveUp: false,
		canMoveDown: false,
	})
	const section = (
		key: string,
		sectionLabel: string,
		list: StandingsTeamInput[],
		lines: StandingsSection["lines"] = [],
	): StandingsSection => ({
		key,
		label: sectionLabel,
		rows: list.map(row),
		lines,
	})
	const divisionSections = (lines: StandingsSection["lines"] = []) =>
		divisionNames.map((division) =>
			section(
				`division:${division}`,
				divisionLabel(conference, division),
				[
					...inDivision(picked, division),
					...inDivision(unpicked, division),
				],
				lines,
			),
		)

	if (!complete) {
		return {
			conference,
			label,
			seedsNote: `Pick every ${label} team to see seeds.`,
			sections:
				rules.format.kind === "conference"
					? [section("conference", label, [...picked, ...unpicked])]
					: divisionSections(),
		}
	}

	const sections = match(rules.format)
		.returnType<StandingsSection[]>()
		.with({ kind: "divisionWinners" }, ({ wildCards, byes }) => {
			const leaders = picked.filter((team) =>
				divisionNames.some(
					(division) => inDivision(picked, division)[0] === team,
				),
			)
			const pool = picked.filter((team) => !leaders.includes(team))
			place(
				leaders,
				(i) => (i < byes ? "bye" : "playoff"),
				(i) => String(i + 1),
			)
			place(
				pool,
				(i) => (i < wildCards ? "playoff" : "out"),
				(i) => (i < wildCards ? String(leaders.length + i + 1) : null),
			)
			return [
				...divisionSections(),
				section("leaders", "Division leaders", leaders),
				section("wildCard", "Wild card", pool, [
					{ after: wildCards - 1, label: "Playoff line" },
				]),
			]
		})
		.with({ kind: "divisionTop" }, ({ perDivision, wildCards }) => {
			const qualified = new Set(
				divisionNames.flatMap((division) =>
					inDivision(picked, division).slice(0, perDivision),
				),
			)
			place(
				[...qualified],
				() => "playoff",
				() => null,
			)
			const pool = picked.filter((team) => !qualified.has(team))
			place(
				pool,
				(i) => (i < wildCards ? "playoff" : "out"),
				(i) => (i < wildCards ? `WC${i + 1}` : null),
			)
			return [
				...divisionSections([
					{ after: perDivision - 1, label: "Playoff line" },
				]),
				section("wildCard", "Wild card", pool, [
					{ after: wildCards - 1, label: "Playoff line" },
				]),
			]
		})
		.with({ kind: "conference" }, ({ playoffSpots, playInThrough }) => {
			place(
				picked,
				(i) =>
					i < playoffSpots ? "playoff" : i < playInThrough ? "playIn" : "out",
				(i) => (i < playInThrough ? String(i + 1) : null),
			)
			return [
				section("conference", label, picked, [
					{ after: playoffSpots - 1, label: "Playoff line" },
					{ after: playInThrough - 1, label: "Play-in line" },
				]),
			]
		})
		.exhaustive()

	return { conference, label, sections, seedsNote: null }
}

function build(
	rules: League,
	gamesPerSeason: number,
	teams: StandingsTeamInput[],
): ProjectedStandings {
	const divisionLabel = divisionLabels(teams)
	const conferenceNames = [
		...new Set(teams.map((t) => t.conference ?? "")),
	].sort((a, b) => a.localeCompare(b))
	const picked = teams.filter((t) => t.wins !== null)
	return {
		conferences: conferenceNames.map((conference) =>
			buildConference(
				conference,
				teams.filter((t) => t.conference === conference),
				rules,
				gamesPerSeason,
				divisionLabel,
			),
		),
		showLosses: rules.showLosses,
		projectedWins: picked.reduce((sum, t) => sum + (t.wins ?? 0), 0),
		leagueWins: (gamesPerSeason * teams.length) / 2,
		pickedCount: picked.length,
		teamCount: teams.length,
	}
}

export function projectStandings(input: {
	leagueSlug: string
	gamesPerSeason: number
	teams: StandingsTeamInput[]
}): ProjectedStandings | null {
	const rules = leagueStandingsRules(input.leagueSlug)
	if (!rules || input.teams.length === 0) return null
	if (input.teams.some((t) => !t.conference)) return null

	const standings = build(rules, input.gamesPerSeason, input.teams)
	for (const section of standings.conferences.flatMap((c) => c.sections)) {
		for (const [i, above] of section.rows.entries()) {
			const below = section.rows[i + 1]
			if (below && above.wins !== null && above.wins === below.wins) {
				above.canMoveDown = true
				below.canMoveUp = true
			}
		}
	}
	return standings
}

type BallotMemberTeam = Pick<
	StandingsTeamInput,
	"name" | "abbreviation" | "color" | "logoUrl" | "conference" | "division"
>

// A ballot's members as standings input, or null when the ballot isn't a
// team's wins per member (anything but a win-totals ballot) or the league has
// no playoff rules here.
export function standingsTeams(
	leagueSlug: string,
	members: {
		questionId: string
		team: BallotMemberTeam | null | undefined
		statName: string | null | undefined
		wins: number | null | undefined
		tiebreakPosition: number | null | undefined
		conviction: number | null | undefined
		callId: string | null | undefined
	}[],
): StandingsTeamInput[] | null {
	if (!leagueStandingsRules(leagueSlug) || members.length === 0) return null
	const teams: StandingsTeamInput[] = []
	for (const member of members) {
		if (member.statName !== "Wins" || !member.team?.conference) return null
		teams.push({
			...member.team,
			questionId: member.questionId,
			wins: member.wins ?? null,
			tiebreakPosition: member.tiebreakPosition ?? null,
			conviction: member.conviction ?? null,
			callId: member.callId ?? null,
		})
	}
	return teams
}
