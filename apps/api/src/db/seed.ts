import {
	BASE_POINTS_BY_TYPE,
	earlyTierFor,
	fieldPct,
	numericGuessPoints,
	selectionPoints,
} from "@called-my-shot/scoring"
import { eq, sql } from "drizzle-orm"
import { DateTime } from "luxon"
import { env } from "../env"
import {
	expiryToDate,
	type InviteExpiryOption,
	insertGroupInvite,
} from "../lib/groups"
import { hashPassword } from "../lib/password"
import { db } from "./index"
import {
	callSelections,
	calls,
	games,
	groupMembers,
	groups,
	leagues,
	type Player,
	players,
	type QuestionOption,
	questionOptions,
	questionShares,
	questions,
	resolutionDisputes,
	sports,
	stats,
	type StatToleranceTier,
	statToleranceTiers,
	type Team,
	teams,
	users,
} from "./schema"

if (env.NODE_ENV === "production" && !env.ALLOW_PROD_SEED) {
	throw new Error(
		"Refusing to run the seed script against production. Set ALLOW_PROD_SEED=true to override.",
	)
}

const daysAgo = (n: number) => DateTime.now().minus({ days: n }).toJSDate()
const daysFromNow = (n: number) => DateTime.now().plus({ days: n }).toJSDate()
const hoursAgo = (n: number) => DateTime.now().minus({ hours: n }).toJSDate()
const hoursFromNow = (n: number) => DateTime.now().plus({ hours: n }).toJSDate()

async function createGroup(
	name: string,
	adminUserId: string,
	memberUserIds: string[],
	expiry: InviteExpiryOption,
) {
	const [group] = await db
		.insert(groups)
		.values({ name, createdBy: adminUserId })
		.returning()

	await db.insert(groupMembers).values([
		{ groupId: group.id, userId: adminUserId, role: "admin" as const },
		...memberUserIds.map((userId) => ({
			groupId: group.id,
			userId,
			role: "member" as const,
		})),
	])

	const invite = await insertGroupInvite(
		group.id,
		adminUserId,
		expiryToDate(expiry),
	)
	for (const userId of memberUserIds) {
		await insertGroupInvite(group.id, userId, expiryToDate(expiry))
	}
	return { group, invite }
}

async function createQuestion(input: typeof questions.$inferInsert) {
	const [question] = await db.insert(questions).values(input).returning()
	return question
}

// away @ home, matching the "@" convention question titles and the detail
// page's game block both read off - not a symmetric teamA/teamB pair.
async function createGame(input: typeof games.$inferInsert) {
	const [game] = await db.insert(games).values(input).returning()
	return game
}

async function shareQuestion(
	groupId: string,
	questionId: string,
	sharedByUserId: string,
) {
	const [share] = await db
		.insert(questionShares)
		.values({ groupId, questionId, sharedBy: sharedByUserId })
		.returning()
	return share
}

async function addOptions(questionId: string, labels: string[]) {
	return db
		.insert(questionOptions)
		.values(
			labels.map((label, sortOrder) => ({ questionId, label, sortOrder })),
		)
		.returning()
}

async function addTeamOptions(questionId: string, teamRows: Team[]) {
	return db
		.insert(questionOptions)
		.values(
			teamRows.map((team, sortOrder) => ({
				questionId,
				label: team.name,
				teamId: team.id,
				sortOrder,
			})),
		)
		.returning()
}

async function addPlayerOptions(questionId: string, playerRows: Player[]) {
	return db
		.insert(questionOptions)
		.values(
			playerRows.map((player, sortOrder) => ({
				questionId,
				label: player.name,
				playerId: player.id,
				sortOrder,
			})),
		)
		.returning()
}

async function callOnOptions(
	questionId: string,
	userId: string,
	picks: { optionId: string; conviction: number }[],
	caseText?: string,
) {
	const [call] = await db
		.insert(calls)
		.values({ questionId, userId, caseText })
		.returning()
	await db.insert(callSelections).values(
		picks.map((pick) => ({
			callId: call.id,
			optionId: pick.optionId,
			conviction: pick.conviction,
		})),
	)
	return call
}

async function callWithGuess(
	questionId: string,
	userId: string,
	guessValue: number,
	conviction: number,
	caseText?: string,
) {
	const [call] = await db
		.insert(calls)
		.values({ questionId, userId, guessValue, conviction, caseText })
		.returning()
	return call
}

// multiple_choice on an optionsOpenField question only - mirrors what
// castCall's resolver does when a caller picks someone not in the pool yet:
// find their existing option on this question, or create it now. Lets the
// seed model an open-field question's pool as genuinely caller-sourced
// instead of pre-listed by addPlayerOptions like a normal multiple_choice.
async function callOnOpenField(
	questionId: string,
	userId: string,
	player: Player,
	conviction: number,
	caseText?: string,
) {
	const existingOptions = await db.query.questionOptions.findMany({
		where: { questionId },
	})
	const existing = existingOptions.find((o) => o.playerId === player.id)
	const option =
		existing ??
		(
			await db
				.insert(questionOptions)
				.values({
					questionId,
					label: player.name,
					playerId: player.id,
					sortOrder: existingOptions.length,
				})
				.returning()
		)[0]
	return callOnOptions(
		questionId,
		userId,
		[{ optionId: option.id, conviction }],
		caseText,
	)
}

// Marks the winning option(s) and scores every selection made on this
// question via the same tierFor/selectionPoints math the live app will use.
// Each option's field share is computed once here, off the final tally, and
// applied to every selection on that option - not a per-caller snapshot, so
// it doesn't matter who called it first.
async function resolveOptionQuestion(
	questionId: string,
	options: QuestionOption[],
	correctOptionIds: string[],
	resolutionNote: string,
) {
	const question = await db.query.questions.findFirst({
		where: { id: questionId },
		columns: { type: true },
	})
	if (!question) throw new Error(`Question ${questionId} not found`)
	const basePoints = BASE_POINTS_BY_TYPE[question.type]

	const questionCalls = await db.query.calls.findMany({
		where: { questionId },
		columns: { id: true, createdAt: true },
	})
	const orderedCalls = [...questionCalls].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	const earlyMultByCallId = new Map(
		orderedCalls.map((c, index) => [
			c.id,
			earlyTierFor(index + 1, orderedCalls.length).mult,
		]),
	)

	for (const option of options) {
		await db
			.update(questionOptions)
			.set({ isCorrect: correctOptionIds.includes(option.id) })
			.where(eq(questionOptions.id, option.id))

		const selections = await db.query.callSelections.findMany({
			where: { optionId: option.id },
		})
		const optionFieldPct = fieldPct(selections.length, questionCalls.length)
		for (const selection of selections) {
			const earlyMult = earlyMultByCallId.get(selection.callId) ?? 1
			await db
				.update(callSelections)
				.set({
					resultPoints: selectionPoints(
						basePoints,
						optionFieldPct,
						options.length,
						selection.conviction,
						correctOptionIds.includes(option.id),
						earlyMult,
					),
				})
				.where(eq(callSelections.id, selection.id))
		}
	}

	await db
		.update(questions)
		.set({ status: "resolved", resolvedAt: new Date(), resolutionNote })
		.where(eq(questions.id, questionId))
}

// Ranks every guess against the actual value to award points; hitTolerance
// comes back from the same call instead of being recomputed separately, so
// there's one source of truth for which guesses actually hit the band.
async function resolveNumericQuestion(
	questionId: string,
	actualValue: number,
	tolerancePct: number,
	resolutionNote: string,
) {
	const questionCalls = await db.query.calls.findMany({ where: { questionId } })
	const guesses = questionCalls
		.filter(
			(
				call,
			): call is typeof call & { guessValue: number; conviction: number } =>
				call.guessValue !== null && call.conviction !== null,
		)
		.map((call) => ({
			callId: call.id,
			guessValue: call.guessValue,
			conviction: call.conviction,
			createdAt: call.createdAt,
		}))
	const resultByCallId = new Map(
		numericGuessPoints(
			BASE_POINTS_BY_TYPE.numeric_guess,
			guesses,
			actualValue,
			tolerancePct,
		).map((r) => [r.callId, r]),
	)

	for (const call of guesses) {
		const result = resultByCallId.get(call.callId)
		await db
			.update(calls)
			.set({
				hitTolerance: result?.hit ?? null,
				resultPoints: result?.points,
				closenessMult: result?.closenessMult ?? null,
				closenessFieldPct: result?.closenessFieldPct ?? null,
			})
			.where(eq(calls.id, call.callId))
	}

	await db
		.update(questions)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolutionNote,
			numericActualValue: actualValue,
		})
		.where(eq(questions.id, questionId))
}

// Files a dispute against an already-resolved question and flips it to
// "disputed" - see resolutionDisputes in db/schema/questions.ts for how an
// admin later resolves it (upheld/overturned, back to "resolved").
async function fileDispute(questionId: string, userId: string, reason: string) {
	await db.insert(resolutionDisputes).values({ questionId, userId, reason })
	await db
		.update(questions)
		.set({ status: "disputed" })
		.where(eq(questions.id, questionId))
}

// This seed script sets calls/callSelections.resultPoints directly (it
// computes scoring itself, above, rather than routing through castCall/
// resolveQuestionInternal), so nothing ever populates user_league_stats the
// way the real app's write path does. Every leaderboard/career-stats read
// comes from that table now (see lib/points-aggregate.ts), so without this
// step a fresh seed looks like every call vanished - the rows are all still
// there, user_league_stats is just empty. Mirrors the one-time migration
// backfill (drizzle/20260820041840_backfill_user_league_stats) exactly.
async function backfillUserLeagueStats() {
	await db.execute(sql`
		insert into user_league_stats (user_id, league_id, points, resolved_call_count, correct_count, call_count)
		with scored as (
			select
				calls.user_id as user_id,
				q.league_id as league_id,
				cs.result_points as points,
				(cs.result_points is not null) as resolved,
				(cs.result_points is not null and qo.is_correct) as correct,
				calls.id as call_id
			from call_selections cs
			join calls on calls.id = cs.call_id
			join question_options qo on qo.id = cs.option_id
			join questions q on q.id = calls.question_id
			where q.type != 'numeric_guess'
			union all
			select
				calls.user_id as user_id,
				q.league_id as league_id,
				calls.result_points as points,
				(calls.result_points is not null) as resolved,
				(calls.result_points is not null and calls.hit_tolerance) as correct,
				calls.id as call_id
			from calls
			join questions q on q.id = calls.question_id
			where q.type = 'numeric_guess'
		)
		select
			user_id,
			league_id,
			coalesce(sum(points) filter (where resolved), 0) as points,
			count(*) filter (where resolved) as resolved_call_count,
			count(*) filter (where correct) as correct_count,
			count(distinct call_id) as call_count
		from scored
		group by user_id, league_id
	`)
}

async function main() {
	console.log("Wiping existing data...")
	await db.execute(
		"TRUNCATE TABLE call_selections, calls, question_options, question_shares, questions, games, stats, stat_tolerance_tiers, players, teams, leagues, sports, group_invites, group_members, groups, sessions, users RESTART IDENTITY CASCADE",
	)

	console.log("Seeding users...")
	const quinnPasswordHash = await hashPassword("password")
	const restPasswordHash = await hashPassword("password")

	const [
		quinn,
		mpwolves,
		tswish,
		dkanalytics,
		rcourtside,
		ballknower,
		jrhoops,
		slballer,
		statlinesteve,
		courtvision,
		hoopqueen,
		dannyRinger,
		mattfantasy,
	] = await db
		.insert(users)
		.values([
			{
				name: "Quinn Vaughn",
				username: "quinn",
				email: "qvaughn3@gmail.com",
				passwordHash: quinnPasswordHash,
				isAdmin: true,
			},
			{
				name: "Marcus Pierce",
				username: "mpwolves",
				email: "mpwolves@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Taylor Swisher",
				username: "tswish",
				email: "tswish@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Devon Kim",
				username: "dkanalytics",
				email: "dkanalytics@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Riley Cross",
				username: "rcourtside",
				email: "rcourtside@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Bailey Knowles",
				username: "ballknower",
				email: "ballknower@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Jordan Reyes",
				username: "jrhoops",
				email: "jrhoops@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Sam Lin",
				username: "slballer",
				email: "slballer@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Steve Ostrowski",
				username: "statlinesteve",
				email: "statlinesteve@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Casey Vance",
				username: "courtvision",
				email: "courtvision@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Harper Nguyen",
				username: "hoopqueen",
				email: "hoopqueen@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Danny Osei",
				username: "danny_ringer",
				email: "danny.ringer@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Matt Delgado",
				username: "mattfantasy",
				email: "mattfantasy@example.com",
				passwordHash: restPasswordHash,
			},
		])
		.returning()

	console.log("Seeding groups...")

	// quinn is admin here
	const wolfpack = await createGroup(
		"Wolfpack",
		quinn.id,
		[mpwolves.id, tswish.id, dkanalytics.id, rcourtside.id, ballknower.id],
		"SEVEN_DAYS",
	)

	// quinn is a regular member here
	const fantasyLeagueChat = await createGroup(
		"Fantasy League Chat",
		jrhoops.id,
		[
			quinn.id,
			mpwolves.id,
			tswish.id,
			dkanalytics.id,
			rcourtside.id,
			ballknower.id,
			slballer.id,
			statlinesteve.id,
			courtvision.id,
			hoopqueen.id,
		],
		"NO_EXPIRY",
	)

	// quinn isn't in this one - use its invite code to test the join/preview flow
	const ringerFantasyShow = await createGroup(
		"The Ringer Fantasy Show",
		dannyRinger.id,
		[mattfantasy.id, statlinesteve.id, courtvision.id],
		"NO_EXPIRY",
	)

	console.log("Seeding sports, leagues, teams, players, stats...")

	const [basketball, football] = await db
		.insert(sports)
		.values([
			{ name: "Basketball", slug: "basketball" },
			{ name: "Football", slug: "football" },
		])
		.returning()

	const [nba, nfl] = await db
		.insert(leagues)
		.values([
			{ sportId: basketball.id, name: "NBA", abbreviation: "NBA", slug: "nba" },
			{ sportId: football.id, name: "NFL", abbreviation: "NFL", slug: "nfl" },
		])
		.returning()

	// Real primary brand colors, current as of this data's writing - team
	// identities are stable and low-maintenance, unlike rosters below.
	const nbaTeamRows = await db
		.insert(teams)
		.values(
			[
				["Atlanta Hawks", "ATL", "#E03A3E"],
				["Boston Celtics", "BOS", "#007A33"],
				["Brooklyn Nets", "BKN", "#000000"],
				["Charlotte Hornets", "CHA", "#1D1160"],
				["Chicago Bulls", "CHI", "#CE1141"],
				["Cleveland Cavaliers", "CLE", "#860038"],
				["Dallas Mavericks", "DAL", "#00538C"],
				["Denver Nuggets", "DEN", "#0E2240"],
				["Detroit Pistons", "DET", "#C8102E"],
				["Golden State Warriors", "GSW", "#1D428A"],
				["Houston Rockets", "HOU", "#CE1141"],
				["Indiana Pacers", "IND", "#002D62"],
				["LA Clippers", "LAC", "#C8102E"],
				["Los Angeles Lakers", "LAL", "#552583"],
				["Memphis Grizzlies", "MEM", "#5D76A9"],
				["Miami Heat", "MIA", "#98002E"],
				["Milwaukee Bucks", "MIL", "#00471B"],
				["Minnesota Timberwolves", "MIN", "#0C2340"],
				["New Orleans Pelicans", "NOP", "#0C2340"],
				["New York Knicks", "NYK", "#006BB6"],
				["Oklahoma City Thunder", "OKC", "#007AC1"],
				["Orlando Magic", "ORL", "#0077C0"],
				["Philadelphia 76ers", "PHI", "#006BB6"],
				["Phoenix Suns", "PHX", "#E56020"],
				["Portland Trail Blazers", "POR", "#E03A3E"],
				["Sacramento Kings", "SAC", "#5A2D81"],
				["San Antonio Spurs", "SAS", "#C4CED4"],
				["Toronto Raptors", "TOR", "#CE1141"],
				["Utah Jazz", "UTA", "#002B5C"],
				["Washington Wizards", "WAS", "#002B5C"],
			].map(([name, abbreviation, color]) => ({
				leagueId: nba.id,
				name,
				abbreviation,
				color,
			})),
		)
		.returning()

	const nflTeamRows = await db
		.insert(teams)
		.values(
			[
				["Arizona Cardinals", "ARI", "#97233F"],
				["Atlanta Falcons", "ATL", "#A71930"],
				["Baltimore Ravens", "BAL", "#241773"],
				["Buffalo Bills", "BUF", "#00338D"],
				["Carolina Panthers", "CAR", "#0085CA"],
				["Chicago Bears", "CHI", "#0B162A"],
				["Cincinnati Bengals", "CIN", "#FB4F14"],
				["Cleveland Browns", "CLE", "#311D00"],
				["Dallas Cowboys", "DAL", "#041E42"],
				["Denver Broncos", "DEN", "#FB4F14"],
				["Detroit Lions", "DET", "#0076B6"],
				["Green Bay Packers", "GB", "#203731"],
				["Houston Texans", "HOU", "#03202F"],
				["Indianapolis Colts", "IND", "#002C5F"],
				["Jacksonville Jaguars", "JAX", "#101820"],
				["Kansas City Chiefs", "KC", "#E31837"],
				["Las Vegas Raiders", "LV", "#000000"],
				["Los Angeles Chargers", "LAC", "#0080C6"],
				["Los Angeles Rams", "LAR", "#003594"],
				["Miami Dolphins", "MIA", "#008E97"],
				["Minnesota Vikings", "MIN", "#4F2683"],
				["New England Patriots", "NE", "#002244"],
				["New Orleans Saints", "NO", "#D3BC8D"],
				["New York Giants", "NYG", "#0B2265"],
				["New York Jets", "NYJ", "#125740"],
				["Philadelphia Eagles", "PHI", "#004C54"],
				["Pittsburgh Steelers", "PIT", "#FFB612"],
				["San Francisco 49ers", "SF", "#AA0000"],
				["Seattle Seahawks", "SEA", "#002244"],
				["Tampa Bay Buccaneers", "TB", "#D50A0A"],
				["Tennessee Titans", "TEN", "#0C2340"],
				["Washington Commanders", "WAS", "#5A1414"],
			].map(([name, abbreviation, color]) => ({
				leagueId: nfl.id,
				name,
				abbreviation,
				color,
			})),
		)
		.returning()

	const nbaTeam = (abbr: string) => {
		const team = nbaTeamRows.find((t) => t.abbreviation === abbr)
		if (!team) throw new Error(`Missing NBA team: ${abbr}`)
		return team
	}
	const nflTeam = (abbr: string) => {
		const team = nflTeamRows.find((t) => t.abbreviation === abbr)
		if (!team) throw new Error(`Missing NFL team: ${abbr}`)
		return team
	}

	// A real, maintained roster - but a partial one. Enough current/notable
	// players per team to exercise search and autofill, not an exhaustive
	// 53-man/15-man roster sync. Expect this to drift out of date; whoever
	// keeps it current does so by hand, same as team data above.
	const nbaPlayerRows = await db
		.insert(players)
		.values(
			(
				[
					["Joel Embiid", "PHI", "C"],
					["Nikola Jokic", "DEN", "C"],
					["Luka Doncic", "LAL", "PG"],
					["Shai Gilgeous-Alexander", "OKC", "PG"],
					["Giannis Antetokounmpo", "MIL", "PF"],
					["Jayson Tatum", "BOS", "SF"],
					["Anthony Edwards", "MIN", "SG"],
					["Victor Wembanyama", "SAS", "C"],
					["Devin Booker", "PHX", "SG"],
					["Jalen Brunson", "NYK", "PG"],
					["Anthony Davis", "DAL", "PF"],
					["Domantas Sabonis", "SAC", "C"],
					["Tyrese Haliburton", "IND", "PG"],
					["Donovan Mitchell", "CLE", "SG"],
					["Damian Lillard", "MIL", "PG"],
					["Kevin Durant", "HOU", "PF"],
					["Stephen Curry", "GSW", "PG"],
					["LeBron James", "LAL", "SF"],
					["Paolo Banchero", "ORL", "PF"],
					["Karl-Anthony Towns", "NYK", "C"],
					// 2025-26 rookie class, used by the Rookie of the Year question below -
					// draft destinations here are illustrative, not a claim of real fact
					["Cooper Flagg", "DAL", "PF"],
					["Ace Bailey", "UTA", "SF"],
					["Dylan Harper", "SAS", "PG"],
					["Kon Knueppel", "CHA", "SG"],
				] as const
			).map(([name, teamAbbr, position]) => ({
				name,
				position,
				currentTeamId: nbaTeam(teamAbbr).id,
			})),
		)
		.returning()

	const nflPlayerRows = await db
		.insert(players)
		.values(
			(
				[
					["Patrick Mahomes", "KC", "QB"],
					["Josh Allen", "BUF", "QB"],
					["Lamar Jackson", "BAL", "QB"],
					["Joe Burrow", "CIN", "QB"],
					["Justin Jefferson", "MIN", "WR"],
					["Ja'Marr Chase", "CIN", "WR"],
					["CeeDee Lamb", "DAL", "WR"],
					["Christian McCaffrey", "SF", "RB"],
					["Saquon Barkley", "PHI", "RB"],
					["Travis Kelce", "KC", "TE"],
					["Tyreek Hill", "MIA", "WR"],
					["A.J. Brown", "PHI", "WR"],
					["Jahmyr Gibbs", "DET", "RB"],
					["Amon-Ra St. Brown", "DET", "WR"],
					["Bijan Robinson", "ATL", "RB"],
				] as const
			).map(([name, teamAbbr, position]) => ({
				name,
				position,
				currentTeamId: nflTeam(teamAbbr).id,
			})),
		)
		.returning()

	const nbaPlayer = (name: string) => {
		const player = nbaPlayerRows.find((p) => p.name === name)
		if (!player) throw new Error(`Missing NBA player: ${name}`)
		return player
	}
	const nflPlayer = (name: string) => {
		const player = nflPlayerRows.find((p) => p.name === name)
		if (!player) throw new Error(`Missing NFL player: ${name}`)
		return player
	}

	// Two tolerance tiers, not one row per stat - a low-count box-score stat
	// (rebounds, a touchdown count) needs a looser percentage than a
	// high-volume one (passing yards, points) or rounding to the nearest whole
	// number eats most of the band. Every stat below points at one of these;
	// adding a new stat later means classifying it into an existing tier, not
	// inventing a new percentage.
	const [lowCountTier, highVolumeTier] = await db
		.insert(statToleranceTiers)
		.values([
			{ name: "Low-Count Box Stat", tolerancePct: 0.15 },
			{ name: "High-Volume", tolerancePct: 0.1 },
		])
		.returning()

	// Scoped to sport, not league - NBA and NCAAB (once we have it) share this
	// same catalog. category groups the list for display instead of one flat
	// wall of chips.
	const basketballStatRows = await db
		.insert(stats)
		.values(
			[
				["Points", "Scoring", highVolumeTier],
				["3-Pointers Made", "Scoring", lowCountTier],
				["Rebounds", "Rebounding", lowCountTier],
				["Assists", "Playmaking", lowCountTier],
				["Turnovers", "Playmaking", lowCountTier],
				["Steals", "Defense", lowCountTier],
				["Blocks", "Defense", lowCountTier],
			].map(([name, category, tier], sortOrder) => ({
				sportId: basketball.id,
				name: name as string,
				category: category as string,
				toleranceTierId: (tier as StatToleranceTier).id,
				sortOrder,
			})),
		)
		.returning()

	const footballStatRows = await db
		.insert(stats)
		.values(
			[
				["Points", "Scoring", highVolumeTier],
				["Passing Yards", "Passing", highVolumeTier],
				["Passing Touchdowns", "Passing", lowCountTier],
				["Rushing Yards", "Rushing", highVolumeTier],
				["Rushing Touchdowns", "Rushing", lowCountTier],
				["Receiving Yards", "Receiving", highVolumeTier],
				["Receptions", "Receiving", lowCountTier],
				["Receiving Touchdowns", "Receiving", lowCountTier],
				["Sacks", "Defense", lowCountTier],
				["Interceptions", "Defense", lowCountTier],
			].map(([name, category, tier], sortOrder) => ({
				sportId: football.id,
				name: name as string,
				category: category as string,
				toleranceTierId: (tier as StatToleranceTier).id,
				sortOrder,
			})),
		)
		.returning()

	const basketballStat = (name: string) => {
		const stat = basketballStatRows.find((s) => s.name === name)
		if (!stat) throw new Error(`Missing basketball stat: ${name}`)
		return stat
	}
	const footballStat = (name: string) => {
		const stat = footballStatRows.find((s) => s.name === name)
		if (!stat) throw new Error(`Missing football stat: ${name}`)
		return stat
	}

	const tierPctById = new Map(
		[lowCountTier, highVolumeTier].map((tier) => [tier.id, tier.tolerancePct]),
	)
	// Mirrors what createQuestion's resolver derives server-side from a stat's
	// toleranceTier - seed data inserts questions directly, bypassing that
	// resolver, so this keeps the two in sync by construction instead of by
	// hand-copied percentages.
	function tolerancePctForStat(stat: { toleranceTierId: string }): number {
		const pct = tierPctById.get(stat.toleranceTierId)
		if (pct === undefined) {
			throw new Error(`Missing tolerance tier for stat ${stat.toleranceTierId}`)
		}
		return pct
	}

	console.log("Seeding games...")

	// Real-world matchups a handful of the questions below are actually
	// scoped to - "away @ home", matching the "@" convention already used in
	// question titles like "76ers @ Nuggets". Not every game-tied question
	// below shares a game row with another (a team can appear in more than
	// one of these, same as a real team plays more than one game a season) -
	// only questions that are genuinely the same real-world game share one.
	const nuggetsSunsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("DEN").id,
		awayTeamId: nbaTeam("PHX").id,
		startsAt: hoursFromNow(5),
	})
	const lakersWarriorsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("LAL").id,
		awayTeamId: nbaTeam("GSW").id,
		startsAt: daysAgo(3),
	})
	const sixersNuggetsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("DEN").id,
		awayTeamId: nbaTeam("PHI").id,
		startsAt: hoursAgo(2),
	})
	const sixersCelticsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("BOS").id,
		awayTeamId: nbaTeam("PHI").id,
		startsAt: hoursFromNow(6),
	})
	const celticsHeatGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("BOS").id,
		awayTeamId: nbaTeam("MIA").id,
		startsAt: daysAgo(1),
	})
	const nuggetsCelticsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("BOS").id,
		awayTeamId: nbaTeam("DEN").id,
		startsAt: daysFromNow(2),
	})
	const bucksPacersGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("MIL").id,
		awayTeamId: nbaTeam("IND").id,
		startsAt: hoursAgo(1),
	})
	const pacersBullsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("IND").id,
		awayTeamId: nbaTeam("CHI").id,
		startsAt: hoursFromNow(7),
	})
	const chiefsRaidersGame = await createGame({
		leagueId: nfl.id,
		homeTeamId: nflTeam("LV").id,
		awayTeamId: nflTeam("KC").id,
		startsAt: hoursFromNow(30),
	})
	const chiefsBillsGame = await createGame({
		leagueId: nfl.id,
		homeTeamId: nflTeam("BUF").id,
		awayTeamId: nflTeam("KC").id,
		startsAt: hoursAgo(1),
	})
	const billsDolphinsGame = await createGame({
		leagueId: nfl.id,
		homeTeamId: nflTeam("BUF").id,
		awayTeamId: nflTeam("MIA").id,
		startsAt: hoursFromNow(20),
	})

	console.log("Seeding NBA questions and calls...")

	// 1. Multiple choice, still open
	const championship2027 = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who wins the 2027 NBA championship?",
		creatorId: quinn.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Finals result",
		locksAt: daysFromNow(70),
	})
	const [celtics27, nuggets27, thunder27, wolves27, magic27] =
		await addTeamOptions(championship2027.id, [
			nbaTeam("BOS"),
			nbaTeam("DEN"),
			nbaTeam("OKC"),
			nbaTeam("MIN"),
			nbaTeam("ORL"),
			nbaTeam("MIL"),
		])
	await callOnOptions(championship2027.id, mpwolves.id, [
		{ optionId: celtics27.id, conviction: 55 },
	])
	await callOnOptions(championship2027.id, tswish.id, [
		{ optionId: nuggets27.id, conviction: 60 },
	])
	await callOnOptions(championship2027.id, dkanalytics.id, [
		{ optionId: thunder27.id, conviction: 50 },
	])
	await callOnOptions(championship2027.id, rcourtside.id, [
		{ optionId: celtics27.id, conviction: 40 },
	])
	await callOnOptions(championship2027.id, ballknower.id, [
		{ optionId: magic27.id, conviction: 35 },
	])
	await callOnOptions(
		championship2027.id,
		quinn.id,
		[{ optionId: wolves27.id, conviction: 65 }],
		"Two conference finals runs already - continuity matters more than people give it credit for.",
	)

	// 2. Multiple choice, resolved - quinn called it right
	const championship2026 = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who will win the 2026 NBA championship?",
		creatorId: quinn.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Finals result",
		locksAt: daysAgo(220),
	})
	const [nuggets26, celtics26, , suns26] = await addTeamOptions(
		championship2026.id,
		[nbaTeam("DEN"), nbaTeam("BOS"), nbaTeam("MIL"), nbaTeam("PHX")],
	)
	await callOnOptions(
		championship2026.id,
		quinn.id,
		[{ optionId: nuggets26.id, conviction: 70 }],
		"Jokic playing angry after last year's exit - this was the easiest read of the season.",
	)
	await callOnOptions(championship2026.id, mpwolves.id, [
		{ optionId: celtics26.id, conviction: 50 },
	])
	await callOnOptions(championship2026.id, tswish.id, [
		{ optionId: nuggets26.id, conviction: 40 },
	])
	await callOnOptions(championship2026.id, dkanalytics.id, [
		{ optionId: suns26.id, conviction: 45 },
	])
	await resolveOptionQuestion(
		championship2026.id,
		await db.query.questionOptions.findMany({
			where: { questionId: championship2026.id },
		}),
		[nuggets26.id],
		"Denver Nuggets won the 2026 NBA Finals.",
	)

	// 3. Multiple choice, resolved - quinn called it wrong. Options are players,
	// not teams, so this exercises playerId-backed options.
	const rookieOfYear = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who will win 2025-26 Rookie of the Year?",
		creatorId: quinn.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Rookie of the Year announcement",
		locksAt: daysAgo(150),
	})
	const [flagg, bailey, harper] = await addPlayerOptions(rookieOfYear.id, [
		nbaPlayer("Cooper Flagg"),
		nbaPlayer("Ace Bailey"),
		nbaPlayer("Dylan Harper"),
		nbaPlayer("Kon Knueppel"),
	])
	await callOnOptions(
		rookieOfYear.id,
		quinn.id,
		[{ optionId: bailey.id, conviction: 45 }],
		"Usage rate on that roster favors him over Flagg early.",
	)
	await callOnOptions(rookieOfYear.id, mpwolves.id, [
		{ optionId: flagg.id, conviction: 60 },
	])
	await callOnOptions(rookieOfYear.id, rcourtside.id, [
		{ optionId: harper.id, conviction: 30 },
	])
	await resolveOptionQuestion(
		rookieOfYear.id,
		await db.query.questionOptions.findMany({
			where: { questionId: rookieOfYear.id },
		}),
		[flagg.id],
		"Cooper Flagg won 2025-26 Rookie of the Year.",
	)

	// 4. Yes/No, still open, quinn hasn't called - not every question has a
	// clean stat/subject shape, so this stays a plain title with no
	// statId/subject reference.
	const jokicTripleDouble = await createQuestion({
		type: "yes_no",
		category: "game_stats",
		title: "Will Jokic record a triple-double tonight?",
		creatorId: jrhoops.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: nuggetsSunsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(5),
	})
	const [tdYes, tdNo] = await addOptions(jokicTripleDouble.id, ["Yes", "No"])
	await callOnOptions(jokicTripleDouble.id, tswish.id, [
		{ optionId: tdYes.id, conviction: 40 },
	])
	await callOnOptions(jokicTripleDouble.id, ballknower.id, [
		{ optionId: tdNo.id, conviction: 50 },
	])

	// 5. Yes/No, resolved - quinn called it wrong. Also the seed's one example
	// of a yes_no with a subjectTeam set, for the team-color card accent/badge.
	const lakersMargin = await createQuestion({
		type: "yes_no",
		category: "game_stats",
		title: "Will the Lakers win by 10 or more?",
		creatorId: mpwolves.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: lakersWarriorsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: daysAgo(3),
		numericSubjectType: "team",
		subjectTeamId: nbaTeam("LAL").id,
	})
	const [marginYes, marginNo] = await addOptions(lakersMargin.id, ["Yes", "No"])
	await callOnOptions(lakersMargin.id, quinn.id, [
		{ optionId: marginYes.id, conviction: 80 },
	])
	await callOnOptions(lakersMargin.id, mpwolves.id, [
		{ optionId: marginNo.id, conviction: 50 },
	])
	await resolveOptionQuestion(
		lakersMargin.id,
		await db.query.questionOptions.findMany({
			where: { questionId: lakersMargin.id },
		}),
		[marginNo.id],
		"Lakers won by 6 - final margin fell short of 10.",
	)

	// 6. Over/under, locked (game underway, not resolved yet). Game-wide total,
	// so no subject team/player - just the stat and the line.
	const totalPointsOU = await createQuestion({
		type: "over_under",
		category: "game_stats",
		title: "76ers @ Nuggets - combined total over or under 224.5?",
		creatorId: dkanalytics.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: sixersNuggetsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursAgo(2),
		status: "locked",
		statId: basketballStat("Points").id,
		ouLine: 224.5,
	})
	const [over2245, under2245] = await addOptions(totalPointsOU.id, [
		"Over",
		"Under",
	])
	await callOnOptions(totalPointsOU.id, quinn.id, [
		{ optionId: over2245.id, conviction: 50 },
	])
	await callOnOptions(totalPointsOU.id, jrhoops.id, [
		{ optionId: over2245.id, conviction: 60 },
	])
	await callOnOptions(totalPointsOU.id, rcourtside.id, [
		{ optionId: under2245.id, conviction: 45 },
	])

	// 7. Numeric guess, still open, quinn hasn't called - enough guesses that
	// the distribution chart clears MIN_GUESSES_FOR_CHART and actually renders
	// as a spread of bars instead of the low-volume empty state.
	const embiidRebounds = await createQuestion({
		type: "numeric_guess",
		category: "player_stats",
		title: "How many rebounds will Embiid grab tonight?",
		creatorId: ballknower.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: sixersCelticsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(6),
		statId: basketballStat("Rebounds").id,
		numericSubjectType: "player",
		subjectPlayerId: nbaPlayer("Joel Embiid").id,
		numericTolerancePct: tolerancePctForStat(basketballStat("Rebounds")),
	})
	await callWithGuess(
		embiidRebounds.id,
		tswish.id,
		13,
		45,
		"Minutes have been up the last three games with Maxey out.",
	)
	await callWithGuess(embiidRebounds.id, dkanalytics.id, 11, 50)
	await callWithGuess(embiidRebounds.id, mpwolves.id, 12, 55)
	await callWithGuess(embiidRebounds.id, statlinesteve.id, 14, 40)
	await callWithGuess(embiidRebounds.id, rcourtside.id, 10, 35)
	await callWithGuess(embiidRebounds.id, jrhoops.id, 15, 50)
	await callWithGuess(embiidRebounds.id, ballknower.id, 9, 30)
	await callWithGuess(embiidRebounds.id, courtvision.id, 16, 60)
	await callWithGuess(embiidRebounds.id, hoopqueen.id, 11, 45)
	await callWithGuess(embiidRebounds.id, dannyRinger.id, 13, 50)

	// 8. Numeric guess, resolved - ranked by distance from the actual value
	const tatumPoints = await createQuestion({
		type: "numeric_guess",
		category: "player_stats",
		title: "How many points will Tatum score?",
		creatorId: statlinesteve.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: celticsHeatGame.id,
		resolutionSource: "ESPN box score",
		locksAt: daysAgo(1),
		statId: basketballStat("Points").id,
		numericSubjectType: "player",
		subjectPlayerId: nbaPlayer("Jayson Tatum").id,
		numericTolerancePct: tolerancePctForStat(basketballStat("Points")),
	})
	await callWithGuess(
		tatumPoints.id,
		quinn.id,
		27,
		65,
		"Feel good about this one.",
	)
	await callWithGuess(tatumPoints.id, jrhoops.id, 25, 50)
	await callWithGuess(tatumPoints.id, courtvision.id, 32, 45)
	await callWithGuess(tatumPoints.id, hoopqueen.id, 22, 30)
	await resolveNumericQuestion(
		tatumPoints.id,
		27,
		0.15,
		"Jayson Tatum finished with 27 points.",
	)

	// 9. Multi-select, still open - quinn hasn't picked yet
	const allNbaFirstTeam = await createQuestion({
		type: "multi_select",
		category: "season_awards",
		title: "Predict the 2027 All-NBA First Team",
		creatorId: quinn.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA All-NBA voting result",
		locksAt: daysFromNow(70),
		picksRequired: 5,
	})
	const allNbaPool = await addPlayerOptions(allNbaFirstTeam.id, [
		nbaPlayer("Nikola Jokic"),
		nbaPlayer("Shai Gilgeous-Alexander"),
		nbaPlayer("Giannis Antetokounmpo"),
		nbaPlayer("Luka Doncic"),
		nbaPlayer("Jayson Tatum"),
		nbaPlayer("Victor Wembanyama"),
		nbaPlayer("LeBron James"),
		nbaPlayer("Anthony Edwards"),
		nbaPlayer("Stephen Curry"),
		nbaPlayer("Kevin Durant"),
		nbaPlayer("Anthony Davis"),
		nbaPlayer("Tyrese Haliburton"),
	])
	const byName = (name: string) => {
		const option = allNbaPool.find((o) => o.label === name)
		if (!option) throw new Error(`Missing All-NBA option: ${name}`)
		return option
	}
	// one conviction level applied to every pick ("ONE FOR ALL" mode)
	await callOnOptions(allNbaFirstTeam.id, tswish.id, [
		{ optionId: byName("Nikola Jokic").id, conviction: 50 },
		{ optionId: byName("Luka Doncic").id, conviction: 50 },
		{ optionId: byName("Jayson Tatum").id, conviction: 50 },
		{
			optionId: byName("Victor Wembanyama").id,
			conviction: 50,
		},
		{
			optionId: byName("Anthony Edwards").id,
			conviction: 50,
		},
	])
	// conviction set independently per pick ("PER PICK" mode)
	await callOnOptions(
		allNbaFirstTeam.id,
		jrhoops.id,
		[
			{
				optionId: byName("Nikola Jokic").id,
				conviction: 60,
			},
			{
				optionId: byName("Shai Gilgeous-Alexander").id,
				conviction: 55,
			},
			{
				optionId: byName("Giannis Antetokounmpo").id,
				conviction: 50,
			},
			{
				optionId: byName("Jayson Tatum").id,
				conviction: 45,
			},
			{
				optionId: byName("Anthony Edwards").id,
				conviction: 40,
			},
		],
		"Jokic and SGA are the easy ones. Went with Ant over Wemby since the Spurs' schedule is brutal down the stretch.",
	)

	console.log("Seeding NFL questions and calls...")

	// 10. Multiple choice, still open
	const superBowl = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who wins Super Bowl LXI?",
		creatorId: quinn.id,
		isOfficial: true,
		sportId: football.id,
		leagueId: nfl.id,
		resolutionSource: "Official NFL Super Bowl result",
		locksAt: daysFromNow(150),
	})
	const [chiefs, bills, ravens, eagles] = await addTeamOptions(superBowl.id, [
		nflTeam("KC"),
		nflTeam("BUF"),
		nflTeam("BAL"),
		nflTeam("PHI"),
		nflTeam("SF"),
	])
	await callOnOptions(superBowl.id, quinn.id, [
		{ optionId: bills.id, conviction: 60 },
	])
	await callOnOptions(superBowl.id, dannyRinger.id, [
		{ optionId: chiefs.id, conviction: 55 },
	])
	await callOnOptions(superBowl.id, mattfantasy.id, [
		{ optionId: eagles.id, conviction: 45 },
	])
	await callOnOptions(superBowl.id, statlinesteve.id, [
		{ optionId: ravens.id, conviction: 40 },
	])

	// 11. Numeric guess, still open, quinn hasn't called - a couple of guesses
	// in, below MIN_GUESSES_FOR_CHART, so the distribution renders its
	// low-volume state rather than a full chart.
	const mahomesYards = await createQuestion({
		type: "numeric_guess",
		category: "player_stats",
		title: "How many passing yards will Mahomes throw for?",
		creatorId: dannyRinger.id,
		sportId: football.id,
		leagueId: nfl.id,
		gameId: chiefsRaidersGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(30),
		statId: footballStat("Passing Yards").id,
		numericSubjectType: "player",
		subjectPlayerId: nflPlayer("Patrick Mahomes").id,
		numericTolerancePct: tolerancePctForStat(footballStat("Passing Yards")),
	})
	await callWithGuess(
		mahomesYards.id,
		mattfantasy.id,
		260,
		45,
		"Defense is banged up in the secondary this week.",
	)
	await callWithGuess(mahomesYards.id, courtvision.id, 300, 50)

	// 12. Over/under, locked - game-wide total, no subject
	const chiefsBillsOU = await createQuestion({
		type: "over_under",
		category: "game_stats",
		title: "Chiefs @ Bills - combined total over or under 47.5?",
		creatorId: statlinesteve.id,
		sportId: football.id,
		leagueId: nfl.id,
		gameId: chiefsBillsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursAgo(1),
		status: "locked",
		statId: footballStat("Points").id,
		ouLine: 47.5,
	})
	const [over475, under475] = await addOptions(chiefsBillsOU.id, [
		"Over",
		"Under",
	])
	await callOnOptions(chiefsBillsOU.id, quinn.id, [
		{ optionId: over475.id, conviction: 50 },
	])
	await callOnOptions(chiefsBillsOU.id, dannyRinger.id, [
		{ optionId: under475.id, conviction: 45 },
	])

	// 13. Over/under, still open - quinn hasn't called. The other two
	// over/unders above (6, 12) are both locked with a quinn call already on
	// them, so on their own over_under never exercised the "still open, quinn
	// hasn't called" state every other type gets elsewhere in this file (see
	// nflMvp, allenYards, allNbaFirstTeam). This is the one over_under that does.
	const nuggetsCelticsOU = await createQuestion({
		type: "over_under",
		category: "game_stats",
		title: "Nuggets @ Celtics - combined total over or under 231.5?",
		creatorId: rcourtside.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: nuggetsCelticsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: daysFromNow(2),
		statId: basketballStat("Points").id,
		ouLine: 231.5,
	})
	const [over2315, under2315] = await addOptions(nuggetsCelticsOU.id, [
		"Over",
		"Under",
	])
	await callOnOptions(nuggetsCelticsOU.id, tswish.id, [
		{ optionId: over2315.id, conviction: 45 },
	])
	await callOnOptions(nuggetsCelticsOU.id, ballknower.id, [
		{ optionId: under2315.id, conviction: 50 },
	])

	// 14. Multiple choice, resolved - jrhoops hits a big underdog pick here so
	// Fantasy League Chat's leaderboard isn't just quinn at #1 in every group.
	const inSeasonTournament = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who will win the 2025 NBA In-Season Tournament?",
		creatorId: jrhoops.id,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA In-Season Tournament result",
		locksAt: daysAgo(30),
	})
	const [thunderIST, celticsIST, , bucksIST] = await addTeamOptions(
		inSeasonTournament.id,
		[nbaTeam("OKC"), nbaTeam("BOS"), nbaTeam("DEN"), nbaTeam("MIL")],
	)
	await callOnOptions(
		inSeasonTournament.id,
		jrhoops.id,
		[{ optionId: thunderIST.id, conviction: 85 }],
		"Nobody was talking about OKC before this thing started. Book it.",
	)
	await callOnOptions(inSeasonTournament.id, courtvision.id, [
		{ optionId: thunderIST.id, conviction: 50 },
	])
	await callOnOptions(inSeasonTournament.id, tswish.id, [
		{ optionId: celticsIST.id, conviction: 45 },
	])
	await callOnOptions(inSeasonTournament.id, statlinesteve.id, [
		{ optionId: bucksIST.id, conviction: 30 },
	])
	await resolveOptionQuestion(
		inSeasonTournament.id,
		await db.query.questionOptions.findMany({
			where: { questionId: inSeasonTournament.id },
		}),
		[thunderIST.id],
		"Oklahoma City won the 2025 NBA In-Season Tournament.",
	)

	// 15. Multiple choice, disputed - resolved, then immediately contested, so
	// the disputed treatment (ResolutionBanner's amber state, QuestionCard's
	// resolved field signal) has a real question to render against.
	const mvpRace = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who wins 2025-26 NBA MVP?",
		creatorId: courtvision.id,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA MVP announcement",
		locksAt: daysAgo(5),
	})
	const [jokicMvp, sgaMvp, lukaMvp] = await addPlayerOptions(mvpRace.id, [
		nbaPlayer("Nikola Jokic"),
		nbaPlayer("Shai Gilgeous-Alexander"),
		nbaPlayer("Luka Doncic"),
	])
	await callOnOptions(mvpRace.id, quinn.id, [
		{ optionId: sgaMvp.id, conviction: 55 },
	])
	await callOnOptions(
		mvpRace.id,
		tswish.id,
		[{ optionId: jokicMvp.id, conviction: 65 }],
		"Efficiency numbers are absurd again and Denver's record backs it up.",
	)
	await callOnOptions(mvpRace.id, courtvision.id, [
		{ optionId: lukaMvp.id, conviction: 40 },
	])
	await resolveOptionQuestion(
		mvpRace.id,
		await db.query.questionOptions.findMany({
			where: { questionId: mvpRace.id },
		}),
		[sgaMvp.id],
		"Shai Gilgeous-Alexander won 2025-26 NBA MVP.",
	)
	await fileDispute(
		mvpRace.id,
		tswish.id,
		"The media panel's own ballots leaked and three of them had Jokic first - this doesn't match the announced result.",
	)

	// 16. Multiple choice, open field - no preset shortlist. Any NFL player is
	// a legal pick, not just the usual QB contenders (see callOnOpenField's
	// comment), so the option pool here is entirely sourced by the calls
	// below rather than pre-listed by addPlayerOptions like every other
	// multiple_choice in this file. Eight distinct picks so the option list
	// actually exercises CastCallForm's "Show more" paging (OPTIONS_PAGE_STEP
	// is 5), not just a short list that fits on one screen. Also still open,
	// quinn hasn't picked yet - alongside allNbaFirstTeam above, gives the
	// "can still call, hasn't called" state a second question type to render
	// against.
	const nflMvp = await createQuestion({
		type: "multiple_choice",
		category: "season_awards",
		title: "Who wins NFL MVP this season?",
		creatorId: dannyRinger.id,
		isOfficial: true,
		sportId: football.id,
		leagueId: nfl.id,
		resolutionSource: "Official NFL MVP announcement",
		locksAt: daysFromNow(140),
		optionsOpenField: true,
		openFieldKind: "player",
	})
	await callOnOpenField(nflMvp.id, mattfantasy.id, nflPlayer("Josh Allen"), 55)
	await callOnOpenField(
		nflMvp.id,
		statlinesteve.id,
		nflPlayer("Patrick Mahomes"),
		45,
	)
	await callOnOpenField(
		nflMvp.id,
		courtvision.id,
		nflPlayer("Lamar Jackson"),
		40,
		"Ravens' offense runs through him more than any other frontrunner's team runs through them.",
	)
	await callOnOpenField(
		nflMvp.id,
		dannyRinger.id,
		nflPlayer("Ja'Marr Chase"),
		30,
		"Nobody's taking a receiver seriously yet, which is exactly why I'm early on it.",
	)
	await callOnOpenField(nflMvp.id, mpwolves.id, nflPlayer("Joe Burrow"), 50)
	await callOnOpenField(nflMvp.id, tswish.id, nflPlayer("Justin Jefferson"), 35)
	await callOnOpenField(
		nflMvp.id,
		rcourtside.id,
		nflPlayer("Christian McCaffrey"),
		45,
	)
	await callOnOpenField(
		nflMvp.id,
		ballknower.id,
		nflPlayer("Saquon Barkley"),
		38,
	)

	// 17. Numeric guess, still open - quinn hasn't picked yet
	const allenYards = await createQuestion({
		type: "numeric_guess",
		category: "player_stats",
		title: "How many passing yards will Josh Allen throw for?",
		creatorId: mattfantasy.id,
		sportId: football.id,
		leagueId: nfl.id,
		gameId: billsDolphinsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(20),
		statId: footballStat("Passing Yards").id,
		numericSubjectType: "player",
		subjectPlayerId: nflPlayer("Josh Allen").id,
		numericTolerancePct: tolerancePctForStat(footballStat("Passing Yards")),
	})
	await callWithGuess(allenYards.id, dannyRinger.id, 265, 50)
	await callWithGuess(allenYards.id, courtvision.id, 240, 45)

	// 19. Numeric guess, still open, zero calls - the other three numeric_guess
	// questions above all have at least a couple of guesses on them already, so
	// none of them shows what the picker/distribution actually look like on a
	// genuinely untouched question. This is that one.
	await createQuestion({
		type: "numeric_guess",
		category: "player_stats",
		title: "How many assists will Haliburton dish out tonight?",
		creatorId: slballer.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: pacersBullsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(7),
		statId: basketballStat("Assists").id,
		numericSubjectType: "player",
		subjectPlayerId: nbaPlayer("Tyrese Haliburton").id,
		numericTolerancePct: tolerancePctForStat(basketballStat("Assists")),
	})

	// 18. Yes/No, locked (game underway) but not yet resolved - quinn hasn't
	// called. The other two locked-and-unresolved questions above (6, 12) both
	// have a quinn call, so on their own the route's "Locked - you didn't call
	// this one" empty state (see $questionId.tsx) never rendered anywhere in
	// seed data. This is the one question that exercises it.
	const giannisTripleDouble = await createQuestion({
		type: "yes_no",
		category: "game_stats",
		title: "Will Giannis record a 30-point triple-double tonight?",
		creatorId: jrhoops.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: bucksPacersGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursAgo(1),
		status: "locked",
	})
	const [giannisYes, giannisNo] = await addOptions(giannisTripleDouble.id, [
		"Yes",
		"No",
	])
	await callOnOptions(giannisTripleDouble.id, jrhoops.id, [
		{ optionId: giannisYes.id, conviction: 50 },
	])
	await callOnOptions(giannisTripleDouble.id, slballer.id, [
		{ optionId: giannisNo.id, conviction: 40 },
	])

	console.log("Seeding shared questions...")

	// Wolfpack (quinn = admin)
	await shareQuestion(wolfpack.group.id, championship2027.id, mpwolves.id)
	await shareQuestion(wolfpack.group.id, embiidRebounds.id, tswish.id)
	await shareQuestion(wolfpack.group.id, allNbaFirstTeam.id, quinn.id)

	// Fantasy League Chat (quinn = member)
	await shareQuestion(fantasyLeagueChat.group.id, superBowl.id, jrhoops.id)
	await shareQuestion(
		fantasyLeagueChat.group.id,
		mahomesYards.id,
		statlinesteve.id,
	)
	await shareQuestion(
		fantasyLeagueChat.group.id,
		jokicTripleDouble.id,
		quinn.id,
	)

	await backfillUserLeagueStats()

	console.log("\nDone.\n")
	console.log("Log in as quinn: qvaughn3@gmail.com / password")
	console.log("\nGroups:")
	console.log(
		`  Wolfpack               (quinn = admin)   code: ${wolfpack.invite.code}`,
	)
	console.log(
		`  Fantasy League Chat    (quinn = member)  code: ${fantasyLeagueChat.invite.code}`,
	)
	console.log(
		`  The Ringer Fantasy Show (quinn not a member, pending invite) code: ${ringerFantasyShow.invite.code}`,
	)
	console.log("\nWolfpack shared tab: 3 questions (1 shared by quinn)")
	console.log("Fantasy League Chat shared tab: 3 questions (1 shared by quinn)")
	console.log("\nQuestions seeded:")
	console.log("  NBA 1. 2027 championship        multiple_choice  open")
	console.log(
		"  NBA 2. 2026 championship        multiple_choice  resolved - quinn won",
	)
	console.log(
		"  NBA 3. 2025-26 Rookie of Year   multiple_choice  resolved - quinn lost",
	)
	console.log(
		"  NBA 4. Jokic triple-double      yes_no           open, quinn hasn't called",
	)
	console.log(
		"  NBA 5. Lakers win by 10+        yes_no           resolved - quinn lost",
	)
	console.log(
		"  NBA 6. 76ers @ Nuggets total    over_under       locked, unresolved",
	)
	console.log(
		"  NBA 7. Embiid rebounds          numeric_guess    open, quinn hasn't called, 10 guesses (full chart)",
	)
	console.log(
		"  NBA 8. Tatum points             numeric_guess    resolved - quinn won",
	)
	console.log(
		"  NBA 9. All-NBA First Team       multi_select     open, quinn hasn't called",
	)
	console.log("  NFL 10. Super Bowl LXI winner    multiple_choice  open")
	console.log(
		"  NFL 11. Mahomes passing yards    numeric_guess    open, quinn hasn't called, 2 guesses (low-volume)",
	)
	console.log(
		"  NFL 12. Chiefs @ Bills total     over_under       locked, unresolved",
	)
	console.log(
		"  NBA 13. Nuggets @ Celtics total  over_under       open, quinn hasn't called",
	)
	console.log(
		"  NBA 14. 2025 In-Season Tournament multiple_choice resolved - jrhoops won big",
	)
	console.log(
		"  NBA 15. 2025-26 MVP             multiple_choice  disputed - quinn's pick contested",
	)
	console.log(
		"  NFL 16. NFL MVP                 multiple_choice  open field, open, quinn hasn't called",
	)
	console.log(
		"  NFL 17. Josh Allen passing yards numeric_guess    open, quinn hasn't called",
	)
	console.log(
		"  NBA 18. Giannis 30pt triple-dbl yes_no           locked, unresolved, quinn hasn't called",
	)
	console.log(
		"  NBA 19. Haliburton assists      numeric_guess    open, quinn hasn't called, 0 guesses (empty)",
	)

	await db.$client.end()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
