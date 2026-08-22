import {
	BASE_POINTS_BY_SHAPE,
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
import { syncStatCatalog } from "./catalog/stats"
import { db } from "./index"
import {
	callSelections,
	calls,
	games,
	groupMembers,
	groups,
	notifications,
	type Player,
	type QuestionOption,
	questionOptions,
	questionShares,
	questions,
	questionVoids,
	resolutionDisputes,
	type Team,
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

// player_season_award/team_season_award seed a full-roster pool (see
// addTeamOptions/addPlayerOptions calls below) rather than a curated
// shortlist - these look up the specific option a call needs to reference
// out of that full pool by the real team/player's id.
function optionByTeamId(
	pool: QuestionOption[],
	teamId: string,
): QuestionOption {
	const option = pool.find((o) => o.teamId === teamId)
	if (!option) throw new Error(`Missing option for team ${teamId}`)
	return option
}
function optionByPlayerId(
	pool: QuestionOption[],
	playerId: string,
): QuestionOption {
	const option = pool.find((o) => o.playerId === playerId)
	if (!option) throw new Error(`Missing option for player ${playerId}`)
	return option
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
		columns: { shape: true },
	})
	if (!question) throw new Error(`Question ${questionId} not found`)
	const basePoints = BASE_POINTS_BY_SHAPE[question.shape]

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
	const question = await db.query.questions.findFirst({
		where: { id: questionId },
		columns: { shape: true },
	})
	if (!question) throw new Error(`Question ${questionId} not found`)
	const resultByCallId = new Map(
		numericGuessPoints(
			BASE_POINTS_BY_SHAPE[question.shape],
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
			where q.shape not in ('player_stat_numeric_guess', 'team_stat_numeric_guess')
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
			where q.shape in ('player_stat_numeric_guess', 'team_stat_numeric_guess')
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
	// teams/players/games/leagues/sports are NOT wiped here - they're owned by
	// `pnpm sync:sports` (see db/sync/), not this script. Run that first if
	// they're empty; this only resets the app-specific demo content layered
	// on top of whatever real data is already synced.
	await db.execute(
		"TRUNCATE TABLE call_selections, calls, question_options, question_shares, questions, stats, stat_tolerance_tiers, group_invites, group_members, groups, sessions, users RESTART IDENTITY CASCADE",
	)

	console.log("Seeding users...")
	const quinnPasswordHash = await hashPassword("password")
	const restPasswordHash = await hashPassword("password")

	const [
		calledMyShot,
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
				// The account every isOfficial question is attributed to (see
				// getOfficialAccountId in lib/official-account.ts) - not a real
				// hash, on purpose, so this account can never actually be signed
				// into. Matches the 20260822022433_official_account migration's
				// row exactly (same username), since that's what production runs
				// instead of this file.
				name: "Called My Shot",
				username: "calledmyshot",
				email: "official@calledmyshot.com",
				passwordHash: "NO_LOGIN_OFFICIAL_ACCOUNT",
			},
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

	console.log("Loading synced sports, leagues, teams, players, stats...")

	// sports/leagues/teams/players/games are real data owned by `pnpm
	// sync:sports` (db/sync/), not this script - it only queries them.
	const basketball = await db.query.sports.findFirst({
		where: { slug: "basketball" },
	})
	const football = await db.query.sports.findFirst({
		where: { slug: "football" },
	})
	if (!basketball || !football) {
		throw new Error("Missing synced sports - run `pnpm sync:sports` first")
	}

	const nba = await db.query.leagues.findFirst({ where: { slug: "nba" } })
	const nfl = await db.query.leagues.findFirst({ where: { slug: "nfl" } })
	if (!nba || !nfl) {
		throw new Error("Missing synced leagues - run `pnpm sync:sports` first")
	}

	const nbaTeamRows = await db.query.teams.findMany({
		where: { leagueId: nba.id },
	})
	const nflTeamRows = await db.query.teams.findMany({
		where: { leagueId: nfl.id },
	})
	if (nbaTeamRows.length === 0 || nflTeamRows.length === 0) {
		throw new Error("Missing synced teams - run `pnpm sync:sports` first")
	}

	const nbaTeam = (abbr: string) => {
		const team = nbaTeamRows.find((t) => t.abbreviation === abbr)
		if (!team) throw new Error(`Missing synced NBA team: ${abbr}`)
		return team
	}
	const nflTeam = (abbr: string) => {
		const team = nflTeamRows.find((t) => t.abbreviation === abbr)
		if (!team) throw new Error(`Missing synced NFL team: ${abbr}`)
		return team
	}

	const nbaPlayerRows = await db.query.players.findMany({
		where: { currentTeamId: { in: nbaTeamRows.map((t) => t.id) } },
	})
	const nflPlayerRows = await db.query.players.findMany({
		where: { currentTeamId: { in: nflTeamRows.map((t) => t.id) } },
	})

	// Below reaches for specific named stars by exact synced full name - real
	// rosters, so this drifts as trades/retirements happen. If a name below
	// throws "missing", it's genuinely no longer on that team; swap it for
	// someone who is (see the error for a hint).
	const nbaPlayer = (name: string) => {
		const player = nbaPlayerRows.find((p) => p.name === name)
		if (!player) {
			throw new Error(
				`Missing synced NBA player: ${name} - they may have moved teams or retired, pick another synced player`,
			)
		}
		return player
	}
	const nflPlayer = (name: string) => {
		const player = nflPlayerRows.find((p) => p.name === name)
		if (!player) {
			throw new Error(
				`Missing synced NFL player: ${name} - they may have moved teams or retired, pick another synced player`,
			)
		}
		return player
	}

	// The real stat catalog (tolerance tiers + every player/team stat) lives in
	// db/catalog/stats.ts, not here - it's upserted, not inserted, so the exact
	// same call is also what the standalone `db:sync-catalog` script runs
	// against prod. Keeps this file to what it's actually for: fake demo data,
	// not reference data a real environment needs too.
	const {
		basketballStats: basketballStatRows,
		footballStats: footballStatRows,
		toleranceTiers,
	} = await syncStatCatalog()

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
		toleranceTiers.map((tier) => [tier.id, tier.tolerancePct]),
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

	// Fake demo games, same as the rest of this file - just needs a gameId to
	// hang a question on. Teams are real (synced), the matchup/date isn't.
	async function createGame(input: {
		leagueId: string
		homeTeamId: string
		awayTeamId: string
		startsAt: Date
	}) {
		const [game] = await db.insert(games).values(input).returning()
		return game
	}

	const nuggetsSunsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("DEN").id,
		awayTeamId: nbaTeam("PHX").id,
		startsAt: hoursFromNow(5),
	})
	const lakersWarriorsGame = await createGame({
		leagueId: nba.id,
		homeTeamId: nbaTeam("LAL").id,
		awayTeamId: nbaTeam("GS").id,
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

	// 1. Player/team season award (team), still open. Pool is every NBA team,
	// not just the usual contenders - player_season_award/team_season_award
	// have no curated-shortlist mode anymore (see OpenFieldNudge's old
	// reasoning, now baked into the shape itself: the eventual winner has to
	// be a legal pick for everyone, always).
	const championship2027 = await createQuestion({
		shape: "team_season_award",
		title: "Who will win the 2027 NBA championship?",
		awardName: "2027 NBA Championship",
		picksRequired: 1,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Finals result",
		locksAt: daysFromNow(70),
	})
	const championship2027Pool = await addTeamOptions(
		championship2027.id,
		nbaTeamRows,
	)
	const celtics27 = optionByTeamId(championship2027Pool, nbaTeam("BOS").id)
	const nuggets27 = optionByTeamId(championship2027Pool, nbaTeam("DEN").id)
	const thunder27 = optionByTeamId(championship2027Pool, nbaTeam("OKC").id)
	const wolves27 = optionByTeamId(championship2027Pool, nbaTeam("MIN").id)
	const magic27 = optionByTeamId(championship2027Pool, nbaTeam("ORL").id)
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

	// 2. Team season award, resolved - quinn called it right
	const championship2026 = await createQuestion({
		shape: "team_season_award",
		title: "Who will win the 2026 NBA championship?",
		awardName: "2026 NBA Championship",
		picksRequired: 1,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Finals result",
		locksAt: daysAgo(220),
	})
	const championship2026Pool = await addTeamOptions(
		championship2026.id,
		nbaTeamRows,
	)
	const nuggets26 = optionByTeamId(championship2026Pool, nbaTeam("DEN").id)
	const celtics26 = optionByTeamId(championship2026Pool, nbaTeam("BOS").id)
	const suns26 = optionByTeamId(championship2026Pool, nbaTeam("PHX").id)
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

	// 3. Player season award, resolved - quinn called it wrong. Options are
	// players, not teams, so this exercises playerId-backed options.
	const rookieOfYear = await createQuestion({
		shape: "player_season_award",
		title: "Who will win 2025-26 Rookie of the Year?",
		awardName: "2025-26 Rookie of the Year",
		picksRequired: 1,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Rookie of the Year announcement",
		locksAt: daysAgo(150),
	})
	const rookieOfYearPool = await addPlayerOptions(
		rookieOfYear.id,
		nbaPlayerRows,
	)
	const flagg = optionByPlayerId(rookieOfYearPool, nbaPlayer("Cooper Flagg").id)
	const bailey = optionByPlayerId(rookieOfYearPool, nbaPlayer("Ace Bailey").id)
	const harper = optionByPlayerId(
		rookieOfYearPool,
		nbaPlayer("Dylan Harper").id,
	)
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

	// 4. Yes/No prop, still open, quinn hasn't called - not every question has
	// a clean subject (this one's about a specific game moment, not a single
	// tracked entity), so this exercises the subject-less path (eventClause
	// alone carries the whole proposition).
	const jokicTripleDouble = await createQuestion({
		shape: "yes_no_prop",
		title: "Will Jokic record a triple-double tonight?",
		eventClause: "Jokic records a triple-double tonight",
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

	// 5. Yes/No prop, resolved - quinn called it wrong. Also the seed's one
	// example of a yes_no_prop with a subjectTeam set, for the team-color card
	// accent/badge.
	const lakersMargin = await createQuestion({
		shape: "yes_no_prop",
		title: "Will the Lakers win by 10 or more?",
		eventClause: "win by 10 or more",
		creatorId: mpwolves.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: lakersWarriorsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: daysAgo(3),
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

	// 6. Game total over/under, locked (game underway, not resolved yet).
	const totalPointsOU = await createQuestion({
		shape: "game_total_over_under",
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
		shape: "player_stat_numeric_guess",
		title: "How many rebounds will Embiid grab tonight?",
		creatorId: ballknower.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: sixersCelticsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(6),
		statId: basketballStat("Rebounds").id,
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
		shape: "player_stat_numeric_guess",
		title: "How many points will Tatum score?",
		creatorId: statlinesteve.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: celticsHeatGame.id,
		resolutionSource: "ESPN box score",
		locksAt: daysAgo(1),
		statId: basketballStat("Points").id,
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

	// 9. Player season award, pick 5, still open - quinn hasn't picked yet.
	// Pool is every NBA player (see rookieOfYear's comment on why), but the
	// calls below only reach for the usual All-NBA-caliber names.
	const allNbaFirstTeam = await createQuestion({
		shape: "player_season_award",
		title: "Predict the 2027 All-NBA First Team",
		awardName: "2027 All-NBA First Team",
		picksRequired: 5,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA All-NBA voting result",
		locksAt: daysFromNow(70),
	})
	const allNbaPool = await addPlayerOptions(allNbaFirstTeam.id, nbaPlayerRows)
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

	// 10. Team season award, still open
	const superBowl = await createQuestion({
		shape: "team_season_award",
		title: "Who will win Super Bowl LXI?",
		awardName: "Super Bowl LXI",
		picksRequired: 1,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: football.id,
		leagueId: nfl.id,
		resolutionSource: "Official NFL Super Bowl result",
		locksAt: daysFromNow(150),
	})
	const superBowlPool = await addTeamOptions(superBowl.id, nflTeamRows)
	const chiefs = optionByTeamId(superBowlPool, nflTeam("KC").id)
	const bills = optionByTeamId(superBowlPool, nflTeam("BUF").id)
	const ravens = optionByTeamId(superBowlPool, nflTeam("BAL").id)
	const eagles = optionByTeamId(superBowlPool, nflTeam("PHI").id)
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
		shape: "player_stat_numeric_guess",
		title: "How many passing yards will Mahomes throw for?",
		creatorId: dannyRinger.id,
		sportId: football.id,
		leagueId: nfl.id,
		gameId: chiefsRaidersGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(30),
		statId: footballStat("Passing Yards").id,
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

	// 12. Game total over/under, locked
	const chiefsBillsOU = await createQuestion({
		shape: "game_total_over_under",
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

	// 13. Game total over/under, still open - quinn hasn't called. The other
	// two over/unders above (6, 12) are both locked with a quinn call already
	// on them, so on their own this shape family never exercised the "still
	// open, quinn hasn't called" state every other shape gets elsewhere in
	// this file (see nflMvp, allenYards, allNbaFirstTeam). This is the one
	// that does.
	const nuggetsCelticsOU = await createQuestion({
		shape: "game_total_over_under",
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

	// 14. Team season award, resolved - jrhoops hits a big underdog pick here
	// so Fantasy League Chat's leaderboard isn't just quinn at #1 in every
	// group.
	const inSeasonTournament = await createQuestion({
		shape: "team_season_award",
		title: "Who will win the 2025 NBA In-Season Tournament?",
		awardName: "2025 NBA In-Season Tournament",
		picksRequired: 1,
		isOfficial: true,
		creatorId: calledMyShot.id,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA In-Season Tournament result",
		locksAt: daysAgo(30),
	})
	const inSeasonTournamentPool = await addTeamOptions(
		inSeasonTournament.id,
		nbaTeamRows,
	)
	const thunderIST = optionByTeamId(inSeasonTournamentPool, nbaTeam("OKC").id)
	const celticsIST = optionByTeamId(inSeasonTournamentPool, nbaTeam("BOS").id)
	const bucksIST = optionByTeamId(inSeasonTournamentPool, nbaTeam("MIL").id)
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
		shape: "player_season_award",
		title: "Who will win 2025-26 NBA MVP?",
		awardName: "2025-26 NBA MVP",
		picksRequired: 1,
		isOfficial: true,
		creatorId: calledMyShot.id,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA MVP announcement",
		locksAt: daysAgo(5),
	})
	const mvpRacePool = await addPlayerOptions(mvpRace.id, nbaPlayerRows)
	const jokicMvp = optionByPlayerId(mvpRacePool, nbaPlayer("Nikola Jokic").id)
	const sgaMvp = optionByPlayerId(
		mvpRacePool,
		nbaPlayer("Shai Gilgeous-Alexander").id,
	)
	const lukaMvp = optionByPlayerId(mvpRacePool, nbaPlayer("Luka Doncic").id)
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

	// 16. Player season award - pool is every NFL player, not just the usual
	// QB contenders (this is the shape that used to need the open-field
	// mechanism before award pools were always the full roster - see
	// player_season_award's own comment on questions.ts). Eight distinct
	// picks so the option list actually exercises CastCallForm's "Show more"
	// paging (OPTIONS_PAGE_STEP is 5), not just a short list that fits on one
	// screen. Also still open, quinn hasn't picked yet - alongside
	// allNbaFirstTeam above, gives the "can still call, hasn't called" state
	// a second shape to render against.
	const nflMvp = await createQuestion({
		shape: "player_season_award",
		title: "Who will win NFL MVP this season?",
		awardName: "NFL MVP",
		picksRequired: 1,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: football.id,
		leagueId: nfl.id,
		resolutionSource: "Official NFL MVP announcement",
		locksAt: daysFromNow(140),
	})
	const nflMvpPool = await addPlayerOptions(nflMvp.id, nflPlayerRows)
	const nflMvpOption = (name: string) =>
		optionByPlayerId(nflMvpPool, nflPlayer(name).id)
	await callOnOptions(nflMvp.id, mattfantasy.id, [
		{ optionId: nflMvpOption("Josh Allen").id, conviction: 55 },
	])
	await callOnOptions(nflMvp.id, statlinesteve.id, [
		{ optionId: nflMvpOption("Patrick Mahomes").id, conviction: 45 },
	])
	await callOnOptions(
		nflMvp.id,
		courtvision.id,
		[{ optionId: nflMvpOption("Lamar Jackson").id, conviction: 40 }],
		"Ravens' offense runs through him more than any other frontrunner's team runs through them.",
	)
	await callOnOptions(
		nflMvp.id,
		dannyRinger.id,
		[{ optionId: nflMvpOption("Ja'Marr Chase").id, conviction: 30 }],
		"Nobody's taking a receiver seriously yet, which is exactly why I'm early on it.",
	)
	await callOnOptions(nflMvp.id, mpwolves.id, [
		{ optionId: nflMvpOption("Joe Burrow").id, conviction: 50 },
	])
	await callOnOptions(nflMvp.id, tswish.id, [
		{ optionId: nflMvpOption("Justin Jefferson").id, conviction: 35 },
	])
	await callOnOptions(nflMvp.id, rcourtside.id, [
		{ optionId: nflMvpOption("Christian McCaffrey").id, conviction: 45 },
	])
	await callOnOptions(nflMvp.id, ballknower.id, [
		{ optionId: nflMvpOption("Saquon Barkley").id, conviction: 38 },
	])

	// 17. Numeric guess, still open - quinn hasn't picked yet
	const allenYards = await createQuestion({
		shape: "player_stat_numeric_guess",
		title: "How many passing yards will Josh Allen throw for?",
		creatorId: mattfantasy.id,
		sportId: football.id,
		leagueId: nfl.id,
		gameId: billsDolphinsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(20),
		statId: footballStat("Passing Yards").id,
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
		shape: "player_stat_numeric_guess",
		title: "How many assists will Haliburton dish out tonight?",
		creatorId: slballer.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: pacersBullsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(7),
		statId: basketballStat("Assists").id,
		subjectPlayerId: nbaPlayer("Tyrese Haliburton").id,
		numericTolerancePct: tolerancePctForStat(basketballStat("Assists")),
	})

	// 18. Yes/No prop, locked (game underway) but not yet resolved - quinn
	// hasn't called. The other two locked-and-unresolved questions above (6,
	// 12) both have a quinn call, so on their own the route's "Locked - you
	// didn't call this one" empty state (see $questionId.tsx) never rendered
	// anywhere in seed data. This is the one question that exercises it. Also
	// the seed's one example of a yes_no_prop with a subjectPlayer set
	// (jokicTripleDouble has none, lakersMargin has a team) - fills out all
	// three subject combinations.
	const giannisTripleDouble = await createQuestion({
		shape: "yes_no_prop",
		title: "Will Giannis record a 30-point triple-double tonight?",
		eventClause: "records a 30-point triple-double tonight",
		subjectPlayerId: nbaPlayer("Giannis Antetokounmpo").id,
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

	// 20. Player vs player - new shape, no prior analog among the types this
	// file used to seed. Exactly 2 named real players plus the stat being
	// compared, not a general pool.
	const jokicVsEmbiid = await createQuestion({
		shape: "player_vs_player",
		title: "Rebounds: Nikola Jokic vs Joel Embiid",
		statId: basketballStat("Rebounds").id,
		creatorId: dkanalytics.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: sixersNuggetsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursAgo(2),
		status: "locked",
	})
	const [jokicRebOption, embiidRebOption] = await addPlayerOptions(
		jokicVsEmbiid.id,
		[nbaPlayer("Nikola Jokic"), nbaPlayer("Joel Embiid")],
	)
	await callOnOptions(jokicVsEmbiid.id, rcourtside.id, [
		{ optionId: jokicRebOption.id, conviction: 55 },
	])
	await callOnOptions(jokicVsEmbiid.id, ballknower.id, [
		{ optionId: embiidRebOption.id, conviction: 50 },
	])

	// 21. Team vs team / game outcome - the real resolver auto-derives its two
	// options from the picked game's home/away teams rather than a creator-
	// submitted pool; mirrored here by seeding them straight from the game's
	// own teams, away side first.
	const pacersBullsOutcome = await createQuestion({
		shape: "team_vs_team",
		title: "Bulls @ Pacers - who will win?",
		creatorId: hoopqueen.id,
		sportId: basketball.id,
		leagueId: nba.id,
		gameId: pacersBullsGame.id,
		resolutionSource: "ESPN box score",
		locksAt: hoursFromNow(7),
	})
	const [pacersBullsAway, pacersBullsHome] = await addTeamOptions(
		pacersBullsOutcome.id,
		[nbaTeam("CHI"), nbaTeam("IND")],
	)
	await callOnOptions(pacersBullsOutcome.id, dannyRinger.id, [
		{ optionId: pacersBullsHome.id, conviction: 50 },
	])
	await callOnOptions(pacersBullsOutcome.id, mattfantasy.id, [
		{ optionId: pacersBullsAway.id, conviction: 45 },
	])

	// 22. Player award finalists - a small, fixed, admin-entered shortlist of
	// real announced finalists, unlike player_season_award's full-roster pool
	// above (mvpRace, nflMvp) - the field has already narrowed to these three
	// by the time a question like this gets posted. Admin/official only.
	const dpoyFinalists = await createQuestion({
		shape: "player_award_finalists",
		title:
			"Who will win Defensive Player of the Year: Victor Wembanyama, Giannis Antetokounmpo, or Anthony Davis?",
		awardName: "Defensive Player of the Year",
		isOfficial: true,
		creatorId: calledMyShot.id,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Defensive Player of the Year announcement",
		locksAt: daysFromNow(60),
	})
	const [wembyDpoy, giannisDpoy] = await addPlayerOptions(dpoyFinalists.id, [
		nbaPlayer("Victor Wembanyama"),
		nbaPlayer("Giannis Antetokounmpo"),
		nbaPlayer("Anthony Davis"),
	])
	await callOnOptions(dpoyFinalists.id, statlinesteve.id, [
		{ optionId: wembyDpoy.id, conviction: 60 },
	])
	await callOnOptions(dpoyFinalists.id, courtvision.id, [
		{ optionId: giannisDpoy.id, conviction: 40 },
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

	console.log("Seeding quinn's notifications...")

	// Option-based (multiple_choice/yes_no/over_under/multi_select) questions
	// score on the selection, not the call - mirrors resolveQuestionInternal's
	// own split.
	async function quinnSelectionPoints(questionId: string): Promise<number> {
		const call = await db.query.calls.findFirst({
			where: { questionId, userId: quinn.id },
			with: { selections: true },
		})
		const points = call?.selections[0]?.resultPoints
		if (points == null) {
			throw new Error(
				`quinnSelectionPoints: no resolved selection for quinn on ${questionId}`,
			)
		}
		return points
	}

	async function quinnCallPoints(questionId: string): Promise<number> {
		const call = await db.query.calls.findFirst({
			where: { questionId, userId: quinn.id },
		})
		if (call?.resultPoints == null) {
			throw new Error(
				`quinnCallPoints: no resolved call for quinn on ${questionId}`,
			)
		}
		return call.resultPoints
	}

	// A dispute against quinn's own resolution - mpwolves lost his championship2026
	// pick and contests the announced result. Mirrors what fileDispute actually
	// does (flip the question to "disputed"), so this is currently pending
	// admin review, same shape as mvpRace's dispute above.
	await fileDispute(
		championship2026.id,
		mpwolves.id,
		"Every recap I can find has this series going 7 games with Boston winning - the announced result doesn't match any coverage.",
	)

	// quinn disputes lakersMargin (he lost that pick) and an admin upholds the
	// original call - no rescoring needed, the resolution just stands.
	await db.insert(resolutionDisputes).values({
		questionId: lakersMargin.id,
		userId: quinn.id,
		reason:
			"Box score I saw had the final margin at 11, not 6 - worth a second look.",
		status: "upheld",
		resolvedAt: hoursAgo(20),
	})

	// quinn disputes rookieOfYear (he also lost that pick) and it gets
	// overturned in his favor - re-runs the same resolution helper used above
	// with the corrected answer, same as overturnDispute re-running
	// resolveQuestionInternal in the real resolver.
	await db.insert(resolutionDisputes).values({
		questionId: rookieOfYear.id,
		userId: quinn.id,
		reason:
			"The league office corrected the Rookie of the Year announcement the next morning - Bailey actually won, not Flagg.",
		status: "overturned",
		resolvedAt: hoursAgo(12),
	})
	// Captured before the re-resolve below overwrites it - the original loss,
	// for the notification quinn already got at the time.
	const rookieOfYearOriginalPoints = await quinnSelectionPoints(rookieOfYear.id)
	const rookieOfYearOptions = await db.query.questionOptions.findMany({
		where: { questionId: rookieOfYear.id },
	})
	const baileyOption = rookieOfYearOptions.find((o) => o.id === bailey.id)
	if (!baileyOption)
		throw new Error("Missing Ace Bailey option on rookieOfYear")
	await resolveOptionQuestion(
		rookieOfYear.id,
		rookieOfYearOptions,
		[bailey.id],
		"Corrected: Ace Bailey actually won 2025-26 Rookie of the Year after a league office review.",
	)

	// A throwaway duplicate of championship2027, voided by an admin - gives
	// quinn a question_voided notification (and the strike that comes with it).
	const duplicateChampionship = await createQuestion({
		shape: "team_season_award",
		title: "Who will win the 2027 NBA title?",
		awardName: "2027 NBA Championship",
		picksRequired: 1,
		creatorId: calledMyShot.id,
		isOfficial: true,
		sportId: basketball.id,
		leagueId: nba.id,
		resolutionSource: "Official NBA Finals result",
		locksAt: daysFromNow(70),
	})
	await db.insert(questionVoids).values({
		questionId: duplicateChampionship.id,
		questionTitle: duplicateChampionship.title,
		targetUserId: quinn.id,
		voidedByAdminId: quinn.id,
		reason: "duplicate",
		duplicateOfQuestionId: championship2027.id,
		note: "Same question as the existing 2027 championship post.",
		countsAsStrike: true,
	})
	await db
		.update(users)
		.set({ strikeCount: sql`${users.strikeCount} + 1` })
		.where(eq(users.id, quinn.id))
	await db.delete(questions).where(eq(questions.id, duplicateChampionship.id))

	// A new member joining Wolfpack after the fact (everyone else joined at
	// group-creation time above) - gives quinn, the group's admin, a
	// group_member_joined notification.
	await db
		.insert(groupMembers)
		.values({ groupId: wolfpack.group.id, userId: slballer.id, role: "member" })
	await insertGroupInvite(
		wolfpack.group.id,
		slballer.id,
		expiryToDate("SEVEN_DAYS"),
	)

	await db.insert(notifications).values([
		// Oldest -> newest, read -> unread, same as a real inbox someone hasn't
		// opened in a few days would look.
		{
			userId: quinn.id,
			type: "call_resolved",
			questionId: championship2026.id,
			questionTitle: championship2026.title,
			pointsDelta: await quinnSelectionPoints(championship2026.id),
			readAt: daysAgo(6),
			createdAt: daysAgo(6),
		},
		{
			userId: quinn.id,
			type: "call_resolved",
			questionId: rookieOfYear.id,
			questionTitle: rookieOfYear.title,
			// The original (pre-overturn) result - a real loss at the time,
			// captured above before the corrective resolveOptionQuestion overwrote it.
			pointsDelta: rookieOfYearOriginalPoints,
			readAt: daysAgo(5),
			createdAt: daysAgo(5),
		},
		{
			userId: quinn.id,
			type: "call_resolved",
			questionId: lakersMargin.id,
			questionTitle: lakersMargin.title,
			pointsDelta: await quinnSelectionPoints(lakersMargin.id),
			readAt: daysAgo(3),
			createdAt: daysAgo(3),
		},
		{
			userId: quinn.id,
			type: "call_resolved",
			questionId: tatumPoints.id,
			questionTitle: tatumPoints.title,
			pointsDelta: await quinnCallPoints(tatumPoints.id),
			readAt: daysAgo(1),
			createdAt: daysAgo(1),
		},
		{
			userId: quinn.id,
			type: "question_shared_to_group",
			groupId: wolfpack.group.id,
			groupName: wolfpack.group.name,
			questionId: championship2027.id,
			questionTitle: championship2027.title,
			actorId: mpwolves.id,
			actorUsername: mpwolves.username,
			readAt: daysAgo(1),
			createdAt: daysAgo(1),
		},
		{
			userId: quinn.id,
			type: "question_shared_to_group",
			groupId: wolfpack.group.id,
			groupName: wolfpack.group.name,
			questionId: embiidRebounds.id,
			questionTitle: embiidRebounds.title,
			actorId: tswish.id,
			actorUsername: tswish.username,
			readAt: daysAgo(1),
			createdAt: daysAgo(1),
		},
		{
			userId: quinn.id,
			type: "question_shared_to_group",
			groupId: fantasyLeagueChat.group.id,
			groupName: fantasyLeagueChat.group.name,
			questionId: superBowl.id,
			questionTitle: superBowl.title,
			actorId: jrhoops.id,
			actorUsername: jrhoops.username,
			readAt: hoursAgo(20),
			createdAt: hoursAgo(20),
		},
		{
			userId: quinn.id,
			type: "question_shared_to_group",
			groupId: fantasyLeagueChat.group.id,
			groupName: fantasyLeagueChat.group.name,
			questionId: mahomesYards.id,
			questionTitle: mahomesYards.title,
			actorId: statlinesteve.id,
			actorUsername: statlinesteve.username,
			readAt: hoursAgo(20),
			createdAt: hoursAgo(20),
		},
		{
			userId: quinn.id,
			type: "dispute_upheld",
			questionId: lakersMargin.id,
			questionTitle: lakersMargin.title,
			readAt: hoursAgo(21),
			createdAt: hoursAgo(21),
		},
		// Unread from here down.
		{
			userId: quinn.id,
			type: "dispute_filed",
			questionId: championship2026.id,
			questionTitle: championship2026.title,
			actorId: mpwolves.id,
			actorUsername: mpwolves.username,
			readAt: null,
			createdAt: hoursAgo(18),
		},
		{
			userId: quinn.id,
			type: "dispute_overturned",
			questionId: rookieOfYear.id,
			questionTitle: rookieOfYear.title,
			readAt: null,
			createdAt: hoursAgo(12),
		},
		{
			userId: quinn.id,
			type: "call_resolved",
			questionId: rookieOfYear.id,
			questionTitle: rookieOfYear.title,
			pointsDelta: await quinnSelectionPoints(rookieOfYear.id),
			readAt: null,
			createdAt: hoursAgo(12),
		},
		{
			userId: quinn.id,
			type: "group_member_joined",
			groupId: wolfpack.group.id,
			groupName: wolfpack.group.name,
			actorId: slballer.id,
			actorUsername: slballer.username,
			readAt: null,
			createdAt: hoursAgo(4),
		},
		{
			userId: quinn.id,
			type: "question_voided",
			questionId: null,
			questionTitle: duplicateChampionship.title,
			strikeCount: 1,
			readAt: null,
			createdAt: hoursAgo(1),
		},
	])

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
	console.log(
		"  NBA 1. 2027 championship        team_season_award          open",
	)
	console.log(
		"  NBA 2. 2026 championship        team_season_award          disputed - quinn won, mpwolves' dispute pending",
	)
	console.log(
		"  NBA 3. 2025-26 Rookie of Year   player_season_award         resolved - quinn's dispute overturned it in his favor",
	)
	console.log(
		"  NBA 4. Jokic triple-double      yes_no_prop                 open, quinn hasn't called",
	)
	console.log(
		"  NBA 5. Lakers win by 10+        yes_no_prop                 resolved - quinn lost",
	)
	console.log(
		"  NBA 6. 76ers @ Nuggets total    game_total_over_under       locked, unresolved",
	)
	console.log(
		"  NBA 7. Embiid rebounds          player_stat_numeric_guess   open, quinn hasn't called, 10 guesses (full chart)",
	)
	console.log(
		"  NBA 8. Tatum points             player_stat_numeric_guess   resolved - quinn won",
	)
	console.log(
		"  NBA 9. All-NBA First Team       player_season_award (x5)    open, quinn hasn't called",
	)
	console.log(
		"  NFL 10. Super Bowl LXI winner    team_season_award          open",
	)
	console.log(
		"  NFL 11. Mahomes passing yards    player_stat_numeric_guess   open, quinn hasn't called, 2 guesses (low-volume)",
	)
	console.log(
		"  NFL 12. Chiefs @ Bills total     game_total_over_under       locked, unresolved",
	)
	console.log(
		"  NBA 13. Nuggets @ Celtics total  game_total_over_under       open, quinn hasn't called",
	)
	console.log(
		"  NBA 14. 2025 In-Season Tournament team_season_award          resolved - jrhoops won big",
	)
	console.log(
		"  NBA 15. 2025-26 MVP             player_season_award         disputed - quinn's pick contested",
	)
	console.log(
		"  NFL 16. NFL MVP                 player_season_award         open, quinn hasn't called",
	)
	console.log(
		"  NFL 17. Josh Allen passing yards player_stat_numeric_guess   open, quinn hasn't called",
	)
	console.log(
		"  NBA 18. Giannis 30pt triple-dbl yes_no_prop                 locked, unresolved, quinn hasn't called",
	)
	console.log(
		"  NBA 19. Haliburton assists      player_stat_numeric_guess   open, quinn hasn't called, 0 guesses (empty)",
	)
	console.log(
		"  NBA 20. Jokic vs Embiid rebounds player_vs_player            locked, unresolved",
	)
	console.log(
		"  NBA 21. Bulls @ Pacers winner    team_vs_team                open",
	)
	console.log(
		"  NBA 22. DPOY finalists           player_award_finalists      open",
	)
	console.log("\nquinn's notifications: 14 total, 5 unread")

	await db.$client.end()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
