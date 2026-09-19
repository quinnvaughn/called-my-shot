import { defaultLossRate } from "@called-my-shot/scoring"
import { db } from "../db"
import {
	type Call,
	callSelections,
	calls,
	flairs,
	games,
	type League,
	leagues,
	type Player,
	players,
	type Question,
	questionOptions,
	questions,
	seasons,
	sports,
	stats,
	statToleranceTiers,
	type Team,
	teams,
	users,
} from "../db/schema"

// Monotonic within a test file so every generated slug/username/abbreviation
// is unique without the caller having to name one. Reset is unnecessary -
// uniqueness only has to hold within a single truncated database.
let n = 0
const uniq = () => ++n

export const HOUR = 60 * 60 * 1000
export const futureDate = (hours = 24) => new Date(Date.now() + hours * HOUR)
export const pastDate = (hours = 24) => new Date(Date.now() - hours * HOUR)

// Resolved foreign keys are spread AFTER `...overrides` in every factory
// below. An override object built from another row's partial fields carries
// explicit `undefined` values for the keys it doesn't set, and those would
// otherwise overwrite the FK the factory just resolved.
async function insertOne<T>(promise: Promise<T[]>): Promise<T> {
	const [row] = await promise
	if (!row) throw new Error("factory insert returned no row")
	return row
}

export function makeUser(overrides: Partial<typeof users.$inferInsert> = {}) {
	const i = uniq()
	return insertOne(
		db
			.insert(users)
			.values({
				name: `User ${i}`,
				username: `user${i}`,
				email: `user${i}@example.com`,
				passwordHash: "not-a-real-hash",
				emailVerified: true,
				...overrides,
			})
			.returning(),
	)
}

export const makeAdmin = (overrides: Partial<typeof users.$inferInsert> = {}) =>
	makeUser({ isAdmin: true, ...overrides })

export function makeSport(overrides: Partial<typeof sports.$inferInsert> = {}) {
	const i = uniq()
	return insertOne(
		db
			.insert(sports)
			.values({ name: `Sport ${i}`, slug: `sport-${i}`, ...overrides })
			.returning(),
	)
}

export async function makeLeague(
	overrides: Partial<typeof leagues.$inferInsert> = {},
) {
	const i = uniq()
	const sportId = overrides.sportId ?? (await makeSport()).id
	return insertOne(
		db
			.insert(leagues)
			.values({
				name: `League ${i}`,
				abbreviation: `L${i}`,
				slug: `league-${i}`,
				...overrides,
				sportId,
			})
			.returning(),
	)
}

export async function makeSeason(
	overrides: Partial<typeof seasons.$inferInsert> = {},
) {
	const i = uniq()
	const leagueId = overrides.leagueId ?? (await makeLeague()).id
	return insertOne(
		db
			.insert(seasons)
			.values({
				year: 2000 + i,
				displayName: `20${i}`,
				regularSeasonStartsAt: pastDate(24 * 90),
				regularSeasonEndsAt: futureDate(24 * 90),
				...overrides,
				leagueId,
			})
			.returning(),
	)
}

export async function makeTeam(
	overrides: Partial<typeof teams.$inferInsert> = {},
) {
	const i = uniq()
	const leagueId = overrides.leagueId ?? (await makeLeague()).id
	return insertOne(
		db
			.insert(teams)
			.values({
				name: `Team ${i}`,
				abbreviation: `T${i}`,
				color: "#007A33",
				...overrides,
				leagueId,
			})
			.returning(),
	)
}

// Defaults to the shape an achievement flair has - its own display columns
// and a grant needed to wear it. Pass { source: "team", unlock: "open",
// teamId } for the other kind, which carries no display columns at all.
export function makeFlair(
	overrides: Partial<typeof flairs.$inferInsert> = {},
) {
	const i = uniq()
	return insertOne(
		db
			.insert(flairs)
			.values({
				key: `flair-${i}`,
				source: "achievement",
				unlock: "grant",
				icon: `F${i}`,
				label: `Flair ${i}`,
				color: "#22C55E",
				...overrides,
			})
			.returning(),
	)
}

export function makePlayer(
	overrides: Partial<typeof players.$inferInsert> = {},
) {
	const i = uniq()
	return insertOne(
		db
			.insert(players)
			.values({ name: `Player ${i}`, ...overrides })
			.returning(),
	)
}

export async function makeStat(
	overrides: Partial<typeof stats.$inferInsert> = {},
	tier: Partial<typeof statToleranceTiers.$inferInsert> = {},
) {
	const i = uniq()
	const sportId = overrides.sportId ?? (await makeSport()).id
	const toleranceTierId =
		overrides.toleranceTierId ??
		(
			await insertOne(
				db
					.insert(statToleranceTiers)
					.values({
						name: `Tier ${i}`,
						toleranceMode: "percentage",
						toleranceValue: 0.1,
						...tier,
					})
					.returning(),
			)
		).id
	return insertOne(
		db
			.insert(stats)
			.values({
				name: `Stat ${i}`,
				category: "General",
				...overrides,
				sportId,
				toleranceTierId,
			})
			.returning(),
	)
}

export async function makeGame(
	overrides: Partial<typeof games.$inferInsert> = {},
) {
	const leagueId = overrides.leagueId ?? (await makeLeague()).id
	const seasonId = overrides.seasonId ?? (await makeSeason({ leagueId })).id
	const homeTeamId = overrides.homeTeamId ?? (await makeTeam({ leagueId })).id
	const awayTeamId = overrides.awayTeamId ?? (await makeTeam({ leagueId })).id
	return insertOne(
		db
			.insert(games)
			.values({
				startsAt: futureDate(),
				...overrides,
				leagueId,
				seasonId,
				homeTeamId,
				awayTeamId,
			})
			.returning(),
	)
}

/**
 * A question plus, unless the caller passes their own, the sport/league/
 * season it needs. Returns the row itself so tests can pass it straight to
 * resolveQuestionInternal.
 */
export async function makeQuestion(
	overrides: Partial<typeof questions.$inferInsert> = {},
): Promise<Question> {
	const i = uniq()
	const leagueId =
		overrides.leagueId ??
		(await makeLeague(overrides.sportId ? { sportId: overrides.sportId } : {}))
			.id
	const league = await db.query.leagues.findFirst({ where: { id: leagueId } })
	if (!league) throw new Error("league vanished")
	const seasonId = overrides.seasonId ?? (await makeSeason({ leagueId })).id
	return insertOne(
		db
			.insert(questions)
			.values({
				shape: "yes_no_prop",
				title: `Question ${i}`,
				resolutionSource: "Box score",
				locksAt: futureDate(),
				eventClause: "happen",
				lossRate: defaultLossRate(overrides.shape ?? "yes_no_prop", {
					picksRequired: overrides.picksRequired,
				}),
				...overrides,
				sportId: overrides.sportId ?? league.sportId,
				leagueId,
				seasonId,
			})
			.returning(),
	)
}

export function makeOption(
	questionId: string,
	overrides: Partial<typeof questionOptions.$inferInsert> = {},
) {
	const i = uniq()
	return insertOne(
		db
			.insert(questionOptions)
			.values({ questionId, label: `Option ${i}`, ...overrides })
			.returning(),
	)
}

/** Yes/No, in that order - the pair every yes_no_prop question carries. */
export async function makeYesNoOptions(questionId: string) {
	const yes = await makeOption(questionId, { label: "Yes", sortOrder: 0 })
	const no = await makeOption(questionId, { label: "No", sortOrder: 1 })
	return { yes, no }
}

export function makeCall(
	questionId: string,
	userId: string,
	overrides: Partial<typeof calls.$inferInsert> = {},
): Promise<Call> {
	return insertOne(
		db
			.insert(calls)
			.values({ questionId, userId, ...overrides })
			.returning(),
	)
}

export function makeSelection(
	callId: string,
	optionId: string,
	conviction = 100,
) {
	return insertOne(
		db
			.insert(callSelections)
			.values({ callId, optionId, conviction })
			.returning(),
	)
}

/**
 * The common option-based setup: one question, its options, and one call per
 * caller with a selection on the option that caller picked.
 */
export async function seedOptionQuestion(opts: {
	shape?: Question["shape"]
	optionLabels?: string[]
	callers: { optionIndex: number; conviction?: number; createdAt?: Date }[]
	question?: Partial<typeof questions.$inferInsert>
}) {
	const question = await makeQuestion({
		shape: opts.shape ?? "yes_no_prop",
		...opts.question,
	})
	const labels = opts.optionLabels ?? ["Yes", "No"]
	const options = []
	for (const [index, label] of labels.entries()) {
		options.push(await makeOption(question.id, { label, sortOrder: index }))
	}
	const callers = []
	for (const spec of opts.callers) {
		const user = await makeUser()
		const call = await makeCall(question.id, user.id, {
			...(spec.createdAt ? { createdAt: spec.createdAt } : {}),
		})
		const selection = await makeSelection(
			call.id,
			options[spec.optionIndex].id,
			spec.conviction ?? 100,
		)
		callers.push({ user, call, selection })
	}
	return { question, options, callers }
}

export type { Call, League, Player, Question, Team }
