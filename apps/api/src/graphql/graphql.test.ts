import { describe, expect, it } from "vitest"
import { db } from "../db"
import { questions } from "../db/schema"
import {
	makeAdmin,
	makeCall,
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeUser,
	pastDate,
	seedOptionQuestion,
} from "../test/factories"
import { execute, expectData } from "../test/graphql"

const CAST_CALL = /* GraphQL */ `
	mutation CastCall($input: CastCallInput!) {
		castCall(input: $input) {
			__typename
			... on CastCallPayload { call { id conviction caseText } }
			... on AuthenticationError { message }
			... on ValidationError { message }
			... on NotFoundError { message }
		}
	}
`

const CREATE_QUESTION = /* GraphQL */ `
	mutation CreateQuestion($input: CreateQuestionInput!) {
		createQuestion(input: $input) {
			__typename
			... on QuestionPayload { question { id title shape isOfficial } }
			... on AuthenticationError { message }
			... on AuthorizationError { message }
			... on ValidationError { message }
		}
	}
`

function yesNoInput(overrides: Record<string, unknown> = {}) {
	return {
		shape: "YES_NO_PROP",
		title: "Will it happen?",
		resolutionSource: "Box score",
		locksAt: new Date(Date.now() + 86_400_000).toISOString(),
		eventClause: "happen",
		options: [{ label: "Yes" }, { label: "No" }],
		...overrides,
	}
}

describe("Query.questions", () => {
	it("returns an empty connection with nothing seeded", async () => {
		const data = await expectData<{
			questions: { items: unknown[]; pageInfo: { hasNextPage: boolean } }
		}>(
			`{ questions(first: 10) { items { id } pageInfo { hasNextPage endCursor } } }`,
		)
		expect(data.questions.items).toEqual([])
		expect(data.questions.pageInfo.hasNextPage).toBe(false)
	})

	it("exposes a seeded question and its options", async () => {
		const { question } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const data = await expectData<{
			questions: { items: { id: string; title: string; options: unknown[] }[] }
		}>(
			`{ questions(first: 10) { items { id title callCount options { label } } } }`,
		)
		expect(data.questions.items).toHaveLength(1)
		expect(data.questions.items[0].id).toBe(question.id)
		expect(data.questions.items[0].options).toHaveLength(2)
	})

	it("counts calls on a question", async () => {
		await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		const data = await expectData<{
			questions: { items: { callCount: number }[] }
		}>(`{ questions(first: 10) { items { callCount } } }`)
		expect(data.questions.items[0].callCount).toBe(2)
	})

	it("filters by league", async () => {
		const a = await makeQuestion()
		await makeQuestion()
		const data = await expectData<{ questions: { items: { id: string }[] } }>(
			`query Q($leagueId: ID) { questions(first: 10, leagueId: $leagueId) { items { id } } }`,
			{ variables: { leagueId: a.leagueId } },
		)
		expect(data.questions.items.map((q) => q.id)).toEqual([a.id])
	})

	it("pages with a stable cursor", async () => {
		for (let i = 0; i < 3; i++) await makeQuestion()
		const first = await expectData<{
			questions: {
				items: { id: string }[]
				pageInfo: { hasNextPage: boolean; endCursor: string }
			}
		}>(
			`{ questions(first: 2, sort: NEW) { items { id } pageInfo { hasNextPage endCursor } } }`,
		)
		expect(first.questions.items).toHaveLength(2)
		expect(first.questions.pageInfo.hasNextPage).toBe(true)

		const second = await expectData<{ questions: { items: { id: string }[] } }>(
			`query Q($after: String) { questions(first: 2, sort: NEW, after: $after) { items { id } } }`,
			{ variables: { after: first.questions.pageInfo.endCursor } },
		)
		expect(second.questions.items).toHaveLength(1)
		const seen = [...first.questions.items, ...second.questions.items]
		expect(new Set(seen.map((q) => q.id)).size).toBe(3)
	})

	it("rejects a malformed cursor with a field error", async () => {
		const result = await execute(
			`{ questions(first: 2, after: "garbage") { items { id } } }`,
		)
		expect(result.errors?.[0]?.message).toMatch(/pagination cursor/i)
	})
})

describe("Query.question", () => {
	it("returns null for an id that isn't a uuid rather than erroring", async () => {
		// A uuid column throws on malformed input, so this has to be caught
		// before it reaches Postgres.
		const result = await execute(`{ question(id: "not-a-uuid") { id } }`)
		expect(result.errors).toBeUndefined()
		expect(result.data?.question).toBeNull()
	})

	it("returns null for a well-formed id that doesn't exist", async () => {
		const data = await expectData<{ question: unknown }>(
			`{ question(id: "00000000-0000-4000-8000-000000000000") { id } }`,
		)
		expect(data.question).toBeNull()
	})
})

describe("viewer-scoped fields", () => {
	it("hides the viewer's call when nobody is signed in", async () => {
		await seedOptionQuestion({ callers: [{ optionIndex: 0 }] })
		const data = await expectData<{
			questions: { items: { viewerCall: unknown }[] }
		}>(`{ questions(first: 1) { items { viewerCall { id } } } }`)
		expect(data.questions.items[0].viewerCall).toBeNull()
	})

	it("returns the viewer's own call when signed in", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const user = await makeUser()
		const call = await makeCall(question.id, user.id)
		await makeSelection(call.id, options[0].id)

		const data = await expectData<{
			questions: { items: { viewerCall: { id: string } | null }[] }
		}>(`{ questions(first: 1) { items { viewerCall { id } } } }`, { as: user })
		expect(data.questions.items[0].viewerCall?.id).toBe(call.id)
	})

	it("does not leak one user's call to another", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const owner = await makeUser()
		const stranger = await makeUser()
		const call = await makeCall(question.id, owner.id)
		await makeSelection(call.id, options[0].id)

		const data = await expectData<{
			questions: { items: { viewerCall: unknown }[] }
		}>(`{ questions(first: 1) { items { viewerCall { id } } } }`, {
			as: stranger,
		})
		expect(data.questions.items[0].viewerCall).toBeNull()
	})
})

describe("Mutation.castCall - authentication", () => {
	it("refuses an anonymous caller", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const data = await expectData<{ castCall: { __typename: string } }>(
			CAST_CALL,
			{
				variables: {
					input: {
						questionId: question.id,
						selections: [{ optionId: options[0].id, conviction: 50 }],
					},
				},
			},
		)
		expect(data.castCall.__typename).toBe("AuthenticationError")
	})

	it("records a call for a signed-in caller", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const user = await makeUser()
		const data = await expectData<{
			castCall: { __typename: string; call: { id: string; caseText: string } }
		}>(CAST_CALL, {
			as: user,
			variables: {
				input: {
					questionId: question.id,
					caseText: "They've been hot all month",
					selections: [{ optionId: options[0].id, conviction: 75 }],
				},
			},
		})
		expect(data.castCall.__typename).toBe("CastCallPayload")
		expect(data.castCall.call.caseText).toBe("They've been hot all month")

		const stored = await db.query.calls.findFirst({
			where: { id: data.castCall.call.id },
			with: { selections: true },
		})
		expect(stored?.userId).toBe(user.id)
		expect(stored?.selections).toHaveLength(1)
	})

	it("bumps the caller's season callCount but not their points", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const user = await makeUser()
		await expectData(CAST_CALL, {
			as: user,
			variables: {
				input: {
					questionId: question.id,
					selections: [{ optionId: options[0].id, conviction: 50 }],
				},
			},
		})
		const stats = await db.query.userSeasonStats.findFirst({
			where: { userId: user.id },
		})
		expect(stats?.callCount).toBe(1)
		expect(stats?.points).toBe(0)
		expect(stats?.resolvedCallCount).toBe(0)
	})
})

describe("Mutation.castCall - rules", () => {
	it("refuses a second call on the same question", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const user = await makeUser()
		const input = {
			questionId: question.id,
			selections: [{ optionId: options[0].id, conviction: 50 }],
		}
		await expectData(CAST_CALL, { as: user, variables: { input } })
		const second = await execute(CAST_CALL, { as: user, variables: { input } })
		// Either a modeled error or a unique-constraint rejection - what
		// matters is that a duplicate never lands.
		const rows = await db.query.calls.findMany({
			where: { questionId: question.id },
		})
		expect(rows).toHaveLength(1)
		const payload = second.data?.castCall as { __typename?: string } | null
		expect(payload?.__typename).not.toBe("CastCallPayload")
	})

	it("refuses a call once the question has locked", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [],
			question: { locksAt: pastDate(1), status: "locked" },
		})
		const user = await makeUser()
		const data = await expectData<{ castCall: { __typename: string } }>(
			CAST_CALL,
			{
				as: user,
				variables: {
					input: {
						questionId: question.id,
						selections: [{ optionId: options[0].id, conviction: 50 }],
					},
				},
			},
		)
		expect(data.castCall.__typename).not.toBe("CastCallPayload")
		expect(await db.query.calls.findMany()).toHaveLength(0)
	})

	it("refuses an option from a different question", async () => {
		const { question } = await seedOptionQuestion({ callers: [] })
		const other = await seedOptionQuestion({ callers: [] })
		const user = await makeUser()
		const data = await expectData<{ castCall: { __typename: string } }>(
			CAST_CALL,
			{
				as: user,
				variables: {
					input: {
						questionId: question.id,
						selections: [{ optionId: other.options[0].id, conviction: 50 }],
					},
				},
			},
		)
		expect(data.castCall.__typename).not.toBe("CastCallPayload")
	})

	it("rejects an out-of-range conviction at the schema boundary", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const user = await makeUser()
		const data = await expectData<{ castCall: { __typename: string } }>(
			CAST_CALL,
			{
				as: user,
				variables: {
					input: {
						questionId: question.id,
						selections: [{ optionId: options[0].id, conviction: 0 }],
					},
				},
			},
		)
		expect(data.castCall.__typename).toBe("ValidationError")
	})

	it("refuses a missing question", async () => {
		const user = await makeUser()
		const data = await expectData<{ castCall: { __typename: string } }>(
			CAST_CALL,
			{
				as: user,
				variables: {
					input: {
						questionId: "00000000-0000-4000-8000-000000000000",
						selections: [
							{
								optionId: "00000000-0000-4000-8000-000000000001",
								conviction: 50,
							},
						],
					},
				},
			},
		)
		expect(data.castCall.__typename).toBe("NotFoundError")
	})
})

describe("Mutation.createQuestion", () => {
	it("refuses an anonymous creator", async () => {
		const data = await expectData<{ createQuestion: { __typename: string } }>(
			CREATE_QUESTION,
			{
				variables: {
					input: yesNoInput({
						sportId: "00000000-0000-4000-8000-000000000000",
						leagueId: "00000000-0000-4000-8000-000000000001",
					}),
				},
			},
		)
		expect(data.createQuestion.__typename).toBe("AuthenticationError")
	})

	it("refuses a creator who hasn't verified their email", async () => {
		const league = (await makeQuestion()).leagueId
		const user = await makeUser({ emailVerified: false })
		const q = await db.query.leagues.findFirst({ where: { id: league } })
		const data = await expectData<{
			createQuestion: { __typename: string; message: string }
		}>(CREATE_QUESTION, {
			as: user,
			variables: {
				input: yesNoInput({ sportId: q?.sportId, leagueId: league }),
			},
		})
		expect(data.createQuestion.__typename).toBe("AuthorizationError")
		expect(data.createQuestion.message).toMatch(/verify your email/i)
	})

	it("refuses a creator whose question creation is suspended", async () => {
		const seed = await makeQuestion()
		const league = await db.query.leagues.findFirst({
			where: { id: seed.leagueId },
		})
		const user = await makeUser({ questionCreationEnabled: false })
		const data = await expectData<{
			createQuestion: { __typename: string; message: string }
		}>(CREATE_QUESTION, {
			as: user,
			variables: {
				input: yesNoInput({
					sportId: league?.sportId,
					leagueId: seed.leagueId,
				}),
			},
		})
		expect(data.createQuestion.__typename).toBe("AuthorizationError")
		expect(data.createQuestion.message).toMatch(/suspended/i)
	})

	it("creates a yes/no question with its option pair", async () => {
		const seed = await makeQuestion()
		const league = await db.query.leagues.findFirst({
			where: { id: seed.leagueId },
		})
		const user = await makeUser()
		const data = await expectData<{
			createQuestion: {
				__typename: string
				question: { id: string; shape: string }
			}
		}>(CREATE_QUESTION, {
			as: user,
			variables: {
				input: yesNoInput({
					sportId: league?.sportId,
					leagueId: seed.leagueId,
				}),
			},
		})
		expect(data.createQuestion.__typename).toBe("QuestionPayload")
		expect(data.createQuestion.question.shape).toBe("YES_NO_PROP")

		const stored = await db.query.questions.findFirst({
			where: { id: data.createQuestion.question.id },
			with: { options: true },
		})
		expect(stored?.creatorId).toBe(user.id)
		expect(stored?.isOfficial).toBe(false)
		expect(stored?.options.length).toBeGreaterThanOrEqual(2)
	})

	it("refuses a non-admin trying to post officially", async () => {
		const seed = await makeQuestion()
		const league = await db.query.leagues.findFirst({
			where: { id: seed.leagueId },
		})
		const user = await makeUser()
		const data = await expectData<{
			createQuestion: { __typename: string; message: string }
		}>(CREATE_QUESTION, {
			as: user,
			variables: {
				input: yesNoInput({
					sportId: league?.sportId,
					leagueId: seed.leagueId,
					isOfficial: true,
				}),
			},
		})
		expect(data.createQuestion.__typename).toBe("AuthorizationError")
		expect(data.createQuestion.message).toMatch(/only admins/i)
		expect(await db.select().from(questions)).toHaveLength(1)
	})

	it("surfaces schema validation as a ValidationError, not a crash", async () => {
		const seed = await makeQuestion()
		const league = await db.query.leagues.findFirst({
			where: { id: seed.leagueId },
		})
		const user = await makeUser()
		const data = await expectData<{ createQuestion: { __typename: string } }>(
			CREATE_QUESTION,
			{
				as: user,
				variables: {
					input: yesNoInput({
						sportId: league?.sportId,
						leagueId: seed.leagueId,
						// yes_no_prop needs a proposition.
						eventClause: "   ",
					}),
				},
			},
		)
		expect(data.createQuestion.__typename).toBe("ValidationError")
	})

	it("refuses a lock time in the past", async () => {
		const seed = await makeQuestion()
		const league = await db.query.leagues.findFirst({
			where: { id: seed.leagueId },
		})
		const user = await makeUser()
		const data = await expectData<{ createQuestion: { __typename: string } }>(
			CREATE_QUESTION,
			{
				as: user,
				variables: {
					input: yesNoInput({
						sportId: league?.sportId,
						leagueId: seed.leagueId,
						locksAt: pastDate(1).toISOString(),
					}),
				},
			},
		)
		expect(data.createQuestion.__typename).toBe("ValidationError")
	})
})

describe("admin-gated queries", () => {
	const ADMIN_QUESTIONS = /* GraphQL */ `
		{
			adminQuestions(first: 5) {
				__typename
				... on QueryAdminQuestionsSuccess { data { items { id } } }
			}
		}
	`

	it("refuses an anonymous viewer", async () => {
		const data = await expectData<{ adminQuestions: { __typename: string } }>(
			ADMIN_QUESTIONS,
		)
		expect(data.adminQuestions.__typename).toBe("AuthenticationError")
	})

	it("refuses a signed-in non-admin", async () => {
		const user = await makeUser()
		const data = await expectData<{ adminQuestions: { __typename: string } }>(
			ADMIN_QUESTIONS,
			{ as: user },
		)
		expect(data.adminQuestions.__typename).toBe("AuthorizationError")
	})

	it("allows an admin", async () => {
		await makeQuestion()
		const admin = await makeAdmin()
		const data = await expectData<{
			adminQuestions: { __typename: string; data: { items: unknown[] } }
		}>(ADMIN_QUESTIONS, { as: admin })
		expect(data.adminQuestions.__typename).toBe("QueryAdminQuestionsSuccess")
		expect(data.adminQuestions.data.items).toHaveLength(1)
	})
})

describe("Query.myCalls", () => {
	const MY_CALLS = /* GraphQL */ `
		query MyCalls($status: CallResolutionStatus!) {
			myCalls(first: 10, status: $status) { items { id } }
		}
	`

	it("refuses an anonymous viewer", async () => {
		const result = await execute(MY_CALLS, { variables: { status: "OPEN" } })
		expect(result.errors?.length).toBeTruthy()
	})

	it("splits open from resolved by the question's status", async () => {
		const user = await makeUser()
		const open = await seedOptionQuestion({ callers: [] })
		const settled = await seedOptionQuestion({
			callers: [],
			question: { status: "resolved" },
		})
		const openCall = await makeCall(open.question.id, user.id)
		await makeSelection(openCall.id, open.options[0].id)
		const settledCall = await makeCall(settled.question.id, user.id)
		await makeSelection(settledCall.id, settled.options[0].id)

		const openData = await expectData<{ myCalls: { items: { id: string }[] } }>(
			MY_CALLS,
			{ as: user, variables: { status: "OPEN" } },
		)
		expect(openData.myCalls.items.map((c) => c.id)).toEqual([openCall.id])

		const resolvedData = await expectData<{
			myCalls: { items: { id: string }[] }
		}>(MY_CALLS, { as: user, variables: { status: "RESOLVED" } })
		expect(resolvedData.myCalls.items.map((c) => c.id)).toEqual([
			settledCall.id,
		])
	})

	it("returns only the viewer's own calls", async () => {
		const mine = await makeUser()
		const theirs = await makeUser()
		const { question, options } = await seedOptionQuestion({ callers: [] })
		const myCall = await makeCall(question.id, mine.id)
		await makeSelection(myCall.id, options[0].id)
		const otherQuestion = await seedOptionQuestion({ callers: [] })
		const theirCall = await makeCall(otherQuestion.question.id, theirs.id)
		await makeSelection(theirCall.id, otherQuestion.options[0].id)

		const data = await expectData<{ myCalls: { items: { id: string }[] } }>(
			MY_CALLS,
			{ as: mine, variables: { status: "OPEN" } },
		)
		expect(data.myCalls.items.map((c) => c.id)).toEqual([myCall.id])
	})
})

describe("schema shape", () => {
	it("exposes no field that resolves to undefined on a bare question", async () => {
		// A smoke test over the whole Question type - catches a resolver that
		// throws only when its relation happens to be null.
		await makeQuestion()
		const data = await expectData<{ questions: { items: unknown[] } }>(`{
			questions(first: 1) {
				items {
					id title shape status isOfficial locksAt resolvedAt
					resolutionSource resolutionSourceUrl resolutionNote
					callCount customStat ouLine statAggregation
					eventClause awardName awardVerb picksRequired
					numericTolerancePct numericToleranceAbsolute numericActualValue
					averageGuess
					creator { id username }
					league { id name slug }
					sport { id name }
					game { id }
					stat { id name }
					subjectTeam { id name }
					subjectPlayer { id name }
					options { id label sortOrder isCorrect callCount fieldPct }
				}
			}
		}`)
		expect(data.questions.items).toHaveLength(1)
	})
})

const SITEMAP_GAMES = /* GraphQL */ `
	query SitemapGames($leagueId: ID!) {
		sitemapGames(leagueId: $leagueId) {
			id
		}
	}
`

const SITEMAP_QUESTIONS = /* GraphQL */ `
	query SitemapQuestions($leagueId: ID!) {
		sitemapQuestions(leagueId: $leagueId) {
			id
		}
	}
`

// A season that ended long ago, so pickCurrentSeason takes the in-progress
// one the default makeSeason produces rather than this.
async function makePriorSeason(leagueId: string) {
	return makeSeason({
		leagueId,
		year: 1990,
		displayName: "1990",
		regularSeasonStartsAt: pastDate(24 * 800),
		regularSeasonEndsAt: pastDate(24 * 700),
	})
}

describe("Query.sitemapGames", () => {
	it("lists the current season's games and skips a prior season's", async () => {
		const league = await makeLeague()
		const current = await makeSeason({ leagueId: league.id })
		const prior = await makePriorSeason(league.id)
		const listed = await makeGame({
			leagueId: league.id,
			seasonId: current.id,
		})
		await makeGame({ leagueId: league.id, seasonId: prior.id })

		const data = await expectData<{ sitemapGames: { id: string }[] }>(
			SITEMAP_GAMES,
			{ variables: { leagueId: league.id } },
		)
		expect(data.sitemapGames.map((g) => g.id)).toEqual([listed.id])
	})

	it("returns nothing for a league with no seasons synced yet", async () => {
		const league = await makeLeague()
		const data = await expectData<{ sitemapGames: unknown[] }>(SITEMAP_GAMES, {
			variables: { leagueId: league.id },
		})
		expect(data.sitemapGames).toEqual([])
	})
})

describe("Query.sitemapQuestions", () => {
	it("lists official questions only", async () => {
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const official = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			isOfficial: true,
		})
		await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			isOfficial: false,
		})

		const data = await expectData<{ sitemapQuestions: { id: string }[] }>(
			SITEMAP_QUESTIONS,
			{ variables: { leagueId: league.id } },
		)
		expect(data.sitemapQuestions.map((q) => q.id)).toEqual([official.id])
	})

	it("skips a prior season's official questions", async () => {
		const league = await makeLeague()
		const current = await makeSeason({ leagueId: league.id })
		const prior = await makePriorSeason(league.id)
		const listed = await makeQuestion({
			leagueId: league.id,
			seasonId: current.id,
			isOfficial: true,
		})
		await makeQuestion({
			leagueId: league.id,
			seasonId: prior.id,
			isOfficial: true,
		})

		const data = await expectData<{ sitemapQuestions: { id: string }[] }>(
			SITEMAP_QUESTIONS,
			{ variables: { leagueId: league.id } },
		)
		expect(data.sitemapQuestions.map((q) => q.id)).toEqual([listed.id])
	})
})
