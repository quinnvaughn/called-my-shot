import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { callSelections, emailOptOuts, questions } from "../db/schema"
import { unsubscribeToken } from "../lib/email-unsubscribe"
import {
	futureDate,
	makeAdmin,
	makeCall,
	makeGame,
	makeLeague,
	makePlayer,
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
		locksAt: futureDate().toISOString(),
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

describe("Query.myLiveCalls", () => {
	const LIVE = /* GraphQL */ `
		query MyLiveCalls($leagueId: ID, $scope: QuestionScope) {
			myLiveCalls(leagueId: $leagueId, scope: $scope) { id }
		}
	`
	type LiveResult = { myLiveCalls: { id: string }[] }

	async function liveGameCall(userId: string, hoursAgo: number) {
		const game = await makeGame({
			status: "live",
			startsAt: pastDate(hoursAgo),
		})
		const question = await makeQuestion({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
			locksAt: pastDate(hoursAgo),
		})
		return { game, call: await makeCall(question.id, userId) }
	}

	// Earliest kickoff first: that game is closest to finishing, so its outcome
	// is the one about to be decided.
	it("returns live calls with the longest-running game first", async () => {
		const user = await makeUser()
		const early = await liveGameCall(user.id, 3)
		const late = await liveGameCall(user.id, 1)

		const data = await expectData<LiveResult>(LIVE, { as: user })
		expect(data.myLiveCalls.map((c) => c.id)).toEqual([
			early.call.id,
			late.call.id,
		])
	})

	// The empty case is the one the old "Live" sort got wrong: with nothing in
	// flight it quietly fell through to a lock-time ordering and looked like
	// every other sort. Now there is simply no section to render.
	it("returns nothing when no called game is in flight", async () => {
		const user = await makeUser()
		const scheduled = await makeGame({
			status: "scheduled",
			startsAt: futureDate(2),
		})
		const scheduledQ = await makeQuestion({
			leagueId: scheduled.leagueId,
			seasonId: scheduled.seasonId,
			gameId: scheduled.id,
		})
		await makeCall(scheduledQ.id, user.id)
		// Season-long: no game at all, so never live.
		const seasonQ = await makeQuestion({ gameId: null })
		await makeCall(seasonQ.id, user.id)

		const data = await expectData<LiveResult>(LIVE, { as: user })
		expect(data.myLiveCalls).toEqual([])
	})

	// A resolved question's call has an outcome already, so it belongs to the
	// Resolved tab however its game row happens to be flagged.
	it("only returns calls the open tab would hold", async () => {
		const user = await makeUser()
		const open = await liveGameCall(user.id, 2)
		const game = await makeGame({ status: "live", startsAt: pastDate(2) })
		const settled = await makeQuestion({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
			status: "resolved",
		})
		await makeCall(settled.id, user.id, { resultPoints: 10 })

		const data = await expectData<LiveResult>(LIVE, { as: user })
		expect(data.myLiveCalls.map((c) => c.id)).toEqual([open.call.id])
	})

	it("narrows by the same filters the list below it uses", async () => {
		const user = await makeUser()
		const mine = await liveGameCall(user.id, 2)
		const other = await liveGameCall(user.id, 2)

		const data = await expectData<LiveResult>(LIVE, {
			as: user,
			variables: { leagueId: mine.game.leagueId },
		})
		expect(data.myLiveCalls.map((c) => c.id)).toEqual([mine.call.id])
		expect(data.myLiveCalls.map((c) => c.id)).not.toContain(other.call.id)
	})

	// The tab badge describes the tab, not the one list under it - a live call
	// is still an open call even though the list below has handed it off.
	it("stays counted in the open tab badge", async () => {
		const COUNTS = /* GraphQL */ `
			query LiveCounts { myCallCounts { open resolved } }
		`
		const user = await makeUser()
		await liveGameCall(user.id, 2)

		const data = await expectData<{
			myCallCounts: { open: number; resolved: number }
		}>(COUNTS, { as: user })
		expect(data.myCallCounts.open).toBe(1)
	})
})

describe("Query.myCalls filtering and sorting", () => {
	const FILTERED = /* GraphQL */ `
		query MyCallsFiltered(
			$status: CallResolutionStatus!
			$leagueId: ID
			$shapes: [QuestionShape!]
			$search: String
			$scope: QuestionScope
			$result: CallResultFilter
			$sort: CallSortOrder
			$direction: SortDirection
			$first: Int
			$after: String
		) {
			myCalls(
				status: $status
				first: $first
				after: $after
				leagueId: $leagueId
				shapes: $shapes
				search: $search
				scope: $scope
				result: $result
				sort: $sort
				direction: $direction
			) {
				items { id }
				pageInfo { hasNextPage endCursor }
			}
		}
	`

	type CallsResult = {
		myCalls: {
			items: { id: string }[]
			pageInfo: { hasNextPage: boolean; endCursor: string | null }
		}
	}

	function ids(data: CallsResult) {
		return data.myCalls.items.map((c) => c.id)
	}

	// One open call per league, so a leagueId filter has something to exclude.
	async function seedTwoLeagues(userId: string) {
		const a = await makeLeague()
		const b = await makeLeague()
		const qa = await makeQuestion({ leagueId: a.id, title: "Mahomes yardage" })
		const qb = await makeQuestion({ leagueId: b.id, title: "Jokic boards" })
		const callA = await makeCall(qa.id, userId)
		const callB = await makeCall(qb.id, userId)
		return { a, b, qa, qb, callA, callB }
	}

	it("narrows to one league", async () => {
		const user = await makeUser()
		const { a, callA } = await seedTwoLeagues(user.id)

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", leagueId: a.id },
		})
		expect(ids(data)).toEqual([callA.id])
	})

	it("narrows to the listed shapes", async () => {
		const user = await makeUser()
		const yesNo = await makeQuestion({ shape: "yes_no_prop" })
		const h2h = await makeQuestion({ shape: "player_vs_player" })
		const yesNoCall = await makeCall(yesNo.id, user.id)
		await makeCall(h2h.id, user.id)

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", shapes: ["YES_NO_PROP"] },
		})
		expect(ids(data)).toEqual([yesNoCall.id])
	})

	it("splits game-scoped from season-long by the question's game", async () => {
		const user = await makeUser()
		const game = await makeGame()
		const gameQuestion = await makeQuestion({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
		})
		const seasonQuestion = await makeQuestion()
		const gameCall = await makeCall(gameQuestion.id, user.id)
		const seasonCall = await makeCall(seasonQuestion.id, user.id)

		const gameOnly = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", scope: "GAME" },
		})
		expect(ids(gameOnly)).toEqual([gameCall.id])

		const seasonOnly = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", scope: "SEASON_LONG" },
		})
		expect(ids(seasonOnly)).toEqual([seasonCall.id])
	})

	it("searches the question title", async () => {
		const user = await makeUser()
		const { callA } = await seedTwoLeagues(user.id)

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", search: "mahomes" },
		})
		expect(ids(data)).toEqual([callA.id])
	})

	it("searches through the question's subject player", async () => {
		const user = await makeUser()
		const player = await makePlayer({ name: "Breanna Stewart" })
		const question = await makeQuestion({
			subjectPlayerId: player.id,
			title: "Untitled",
		})
		const call = await makeCall(question.id, user.id)
		await makeCall((await makeQuestion({ title: "Untitled" })).id, user.id)

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", search: "stewart" },
		})
		expect(ids(data)).toEqual([call.id])
	})

	// The hit/miss/unscored split has to agree with Call.totalPoints, which
	// reads calls.resultPoints when set and otherwise sums the selections - the
	// SQL below reimplements that, so both halves are exercised here.
	it("splits hits, misses and unscored calls", async () => {
		const user = await makeUser()
		const settled = { status: "resolved" as const }

		// Scores off its selection, like every option shape.
		const hitQ = await seedOptionQuestion({ callers: [], question: settled })
		const hit = await makeCall(hitQ.question.id, user.id)
		await db.insert(callSelections).values({
			callId: hit.id,
			optionId: hitQ.options[0].id,
			conviction: 100,
			resultPoints: 120,
		})

		const missQ = await seedOptionQuestion({ callers: [], question: settled })
		const miss = await makeCall(missQ.question.id, user.id)
		await db.insert(callSelections).values({
			callId: miss.id,
			optionId: missQ.options[0].id,
			conviction: 100,
			resultPoints: -40,
		})

		// Scores off the call row itself, like a numeric guess.
		const numericQ = await makeQuestion({
			shape: "player_stat_numeric_guess",
			status: "resolved",
		})
		const numericHit = await makeCall(numericQ.id, user.id, {
			guessValue: 20,
			conviction: 80,
			resultPoints: 55,
		})

		const voidedQ = await makeQuestion({ status: "voided" })
		const unscored = await makeCall(voidedQ.id, user.id, {
			unscoredReason: "question_voided",
		})

		const hits = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "RESOLVED", result: "HIT" },
		})
		expect(ids(hits).sort()).toEqual([hit.id, numericHit.id].sort())

		const misses = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "RESOLVED", result: "MISS" },
		})
		expect(ids(misses)).toEqual([miss.id])

		const unscoredOnly = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "RESOLVED", result: "UNSCORED" },
		})
		expect(ids(unscoredOnly)).toEqual([unscored.id])
	})

	// The Playing Now section owns the live calls, so the list below it must
	// not carry them too - otherwise every in-flight call renders twice.
	it("keeps calls on a live game out of the open list", async () => {
		const user = await makeUser()
		const live = await makeGame({ status: "live", startsAt: pastDate(1) })
		const liveQ = await makeQuestion({
			leagueId: live.leagueId,
			seasonId: live.seasonId,
			gameId: live.id,
			locksAt: pastDate(1),
		})
		const soon = await makeQuestion({ locksAt: futureDate(1) })
		const soonCall = await makeCall(soon.id, user.id)
		await makeCall(liveQ.id, user.id)

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", sort: "DATE" },
		})
		expect(ids(data)).toEqual([soonCall.id])
	})

	// A settled call's game finished long ago, so the exclusion has no business
	// touching the Resolved tab - where it would silently hide any call whose
	// game row is still sitting at "live" because a sync missed the whistle.
	it("leaves the resolved list alone", async () => {
		const user = await makeUser()
		const live = await makeGame({ status: "live", startsAt: pastDate(1) })
		const resolvedQ = await makeQuestion({
			leagueId: live.leagueId,
			seasonId: live.seasonId,
			gameId: live.id,
			status: "resolved",
		})
		const call = await makeCall(resolvedQ.id, user.id, { resultPoints: 10 })

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "RESOLVED" },
		})
		expect(ids(data)).toEqual([call.id])
	})

	// Conviction lives on the call for a numeric guess and on the selections
	// for every other shape, so this orders one against the other.
	it("orders by conviction across both places it is stored", async () => {
		const user = await makeUser()
		const optionQ = await seedOptionQuestion({ callers: [] })
		const optionCall = await makeCall(optionQ.question.id, user.id)
		await makeSelection(optionCall.id, optionQ.options[0].id, 30)

		const numericQ = await makeQuestion({ shape: "player_stat_numeric_guess" })
		const numericCall = await makeCall(numericQ.id, user.id, {
			guessValue: 10,
			conviction: 90,
		})

		const data = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", sort: "CONVICTION" },
		})
		expect(ids(data)).toEqual([numericCall.id, optionCall.id])

		const flipped = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", sort: "CONVICTION", direction: "ASC" },
		})
		expect(ids(flipped)).toEqual([optionCall.id, numericCall.id])
	})

	it("pages without repeating or dropping a row under a non-default sort", async () => {
		const user = await makeUser()
		for (let i = 0; i < 3; i++) {
			const question = await makeQuestion({ locksAt: futureDate(i + 1) })
			await makeCall(question.id, user.id)
		}

		const first = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: { status: "OPEN", sort: "CONVICTION", first: 2 },
		})
		expect(first.myCalls.items).toHaveLength(2)
		expect(first.myCalls.pageInfo.hasNextPage).toBe(true)

		const second = await expectData<CallsResult>(FILTERED, {
			as: user,
			variables: {
				status: "OPEN",
				sort: "CONVICTION",
				first: 2,
				after: first.myCalls.pageInfo.endCursor,
			},
		})
		expect(second.myCalls.items).toHaveLength(1)
		expect(ids(second)[0]).not.toBe(ids(first)[0])
		expect(ids(second)[0]).not.toBe(ids(first)[1])
	})

	it("counts tab badges under the same filters as the list", async () => {
		const COUNTS = /* GraphQL */ `
			query Counts($leagueId: ID) {
				myCallCounts(leagueId: $leagueId) { open resolved }
			}
		`
		const user = await makeUser()
		const { a } = await seedTwoLeagues(user.id)
		const settled = await makeQuestion({
			leagueId: a.id,
			status: "resolved",
		})
		await makeCall(settled.id, user.id)

		const all = await expectData<{
			myCallCounts: { open: number; resolved: number }
		}>(COUNTS, { as: user, variables: {} })
		expect(all.myCallCounts).toEqual({ open: 2, resolved: 1 })

		const scoped = await expectData<{
			myCallCounts: { open: number; resolved: number }
		}>(COUNTS, { as: user, variables: { leagueId: a.id } })
		expect(scoped.myCallCounts).toEqual({ open: 1, resolved: 1 })
	})

	// A hit/miss filter can only mean something for settled calls. Applied to
	// the open count too it would match nothing, and the Open badge would read
	// 0 with a full tab behind it.
	it("leaves the open count alone when a result filter is set", async () => {
		const COUNTS = /* GraphQL */ `
			query ResultCounts($result: CallResultFilter) {
				myCallCounts(result: $result) { open resolved }
			}
		`
		const user = await makeUser()
		await makeCall((await makeQuestion()).id, user.id)

		const settled = await seedOptionQuestion({
			callers: [],
			question: { status: "resolved" },
		})
		const hit = await makeCall(settled.question.id, user.id)
		await db.insert(callSelections).values({
			callId: hit.id,
			optionId: settled.options[0].id,
			conviction: 100,
			resultPoints: 90,
		})

		const data = await expectData<{
			myCallCounts: { open: number; resolved: number }
		}>(COUNTS, { as: user, variables: { result: "HIT" } })
		expect(data.myCallCounts).toEqual({ open: 1, resolved: 1 })
	})
})

describe("Query.myQuestions filtering and sorting", () => {
	const MY_QUESTIONS = /* GraphQL */ `
		query MyQuestionsFiltered(
			$leagueId: ID
			$shapes: [QuestionShape!]
			$search: String
			$scope: QuestionScope
			$status: QuestionStatus
			$sort: MyQuestionSort
			$direction: SortDirection
		) {
			myQuestions(
				leagueId: $leagueId
				shapes: $shapes
				search: $search
				scope: $scope
				status: $status
				sort: $sort
				direction: $direction
			) {
				items { id }
				totalCount
			}
		}
	`

	type QuestionsResult = {
		myQuestions: { items: { id: string }[]; totalCount: number | null }
	}

	it("narrows to one league and reports the filtered total", async () => {
		const user = await makeUser()
		const a = await makeLeague()
		const b = await makeLeague()
		const mine = await makeQuestion({ leagueId: a.id, creatorId: user.id })
		await makeQuestion({ leagueId: b.id, creatorId: user.id })

		const data = await expectData<QuestionsResult>(MY_QUESTIONS, {
			as: user,
			variables: { leagueId: a.id },
		})
		expect(data.myQuestions.items.map((q) => q.id)).toEqual([mine.id])
		expect(data.myQuestions.totalCount).toBe(1)
	})

	it("orders most called by the live call count", async () => {
		const user = await makeUser()
		const quiet = await makeQuestion({ creatorId: user.id })
		const busy = await makeQuestion({ creatorId: user.id })
		for (let i = 0; i < 2; i++) {
			await makeCall(busy.id, (await makeUser()).id)
		}

		const data = await expectData<QuestionsResult>(MY_QUESTIONS, {
			as: user,
			variables: { sort: "MOST_CALLED" },
		})
		expect(data.myQuestions.items.map((q) => q.id)).toEqual([busy.id, quiet.id])
	})

	it("orders by date newest first, or oldest first when flipped", async () => {
		const user = await makeUser()
		const older = await makeQuestion({
			creatorId: user.id,
			createdAt: pastDate(48),
		})
		const newer = await makeQuestion({
			creatorId: user.id,
			createdAt: pastDate(1),
		})

		const desc = await expectData<QuestionsResult>(MY_QUESTIONS, {
			as: user,
			variables: { sort: "DATE" },
		})
		expect(desc.myQuestions.items.map((q) => q.id)).toEqual([
			newer.id,
			older.id,
		])

		const asc = await expectData<QuestionsResult>(MY_QUESTIONS, {
			as: user,
			variables: { sort: "DATE", direction: "ASC" },
		})
		expect(asc.myQuestions.items.map((q) => q.id)).toEqual([older.id, newer.id])
	})

	it("returns only the viewer's own questions", async () => {
		const mine = await makeUser()
		const theirs = await makeUser()
		const myQuestion = await makeQuestion({ creatorId: mine.id })
		await makeQuestion({ creatorId: theirs.id })

		const data = await expectData<QuestionsResult>(MY_QUESTIONS, {
			as: mine,
			variables: {},
		})
		expect(data.myQuestions.items.map((q) => q.id)).toEqual([myQuestion.id])
		expect(data.myQuestions.totalCount).toBe(1)
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

describe("Game.officialQuestions", () => {
	const GAME_OFFICIAL_QUESTIONS = /* GraphQL */ `
		query GameOfficialQuestions($id: ID!) {
			game(id: $id) {
				officialQuestions { id callCount }
			}
		}
	`

	it("lists the game's official questions oldest first, and nothing else", async () => {
		const game = await makeGame()
		const onGame = {
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
		}
		const newer = await makeQuestion({
			...onGame,
			isOfficial: true,
			createdAt: new Date("2026-09-01T12:05:00Z"),
		})
		const older = await makeQuestion({
			...onGame,
			isOfficial: true,
			createdAt: new Date("2026-09-01T12:00:00Z"),
		})
		await makeQuestion({ ...onGame, isOfficial: false })
		const otherGame = await makeGame({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
		})
		await makeQuestion({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: otherGame.id,
			isOfficial: true,
		})

		const data = await expectData<{
			game: { officialQuestions: { id: string; callCount: number }[] }
		}>(GAME_OFFICIAL_QUESTIONS, { variables: { id: game.id } })
		expect(data.game.officialQuestions).toEqual([
			{ id: older.id, callCount: 0 },
			{ id: newer.id, callCount: 0 },
		])
	})
})

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

const SET_EMAIL_PREFERENCE = /* GraphQL */ `
	mutation SetEmailPreference($input: SetEmailPreferenceInput!) {
		setEmailPreference(input: $input) {
			__typename
			... on User { id mutedEmailTypes }
			... on AuthenticationError { message }
		}
	}
`

const UNSUBSCRIBE = /* GraphQL */ `
	mutation UnsubscribeFromEmails($token: String!) {
		unsubscribeFromEmails(token: $token) {
			__typename
			... on MutationUnsubscribeFromEmailsSuccess { data }
			... on ValidationError { message }
		}
	}
`

type SetEmailPreferenceData = {
	setEmailPreference: { __typename: string; mutedEmailTypes?: string[] }
}
type UnsubscribeData = {
	unsubscribeFromEmails: { __typename: string }
}

describe("Mutation.setEmailPreference", () => {
	it("requires a signed-in user", async () => {
		const data = await expectData<SetEmailPreferenceData>(
			SET_EMAIL_PREFERENCE,
			{ variables: { input: { type: "CALL_RESOLVED", enabled: false } } },
		)
		expect(data.setEmailPreference.__typename).toBe("AuthenticationError")
	})

	it("mutes and un-mutes a type", async () => {
		const user = await makeUser()

		const muted = await expectData<SetEmailPreferenceData>(
			SET_EMAIL_PREFERENCE,
			{
				as: user,
				variables: { input: { type: "CALL_RESOLVED", enabled: false } },
			},
		)
		expect(muted.setEmailPreference.mutedEmailTypes).toEqual(["CALL_RESOLVED"])

		const unmuted = await expectData<SetEmailPreferenceData>(
			SET_EMAIL_PREFERENCE,
			{
				as: user,
				variables: { input: { type: "CALL_RESOLVED", enabled: true } },
			},
		)
		expect(unmuted.setEmailPreference.mutedEmailTypes).toEqual([])
	})

	// No row means subscribed, so a fresh account has to come back empty
	// rather than needing anything backfilled for it.
	it("reports nothing muted for a new account", async () => {
		const user = await makeUser()
		const data = await expectData<SetEmailPreferenceData>(
			SET_EMAIL_PREFERENCE,
			{ as: user, variables: { input: { type: "ALL", enabled: true } } },
		)
		expect(data.setEmailPreference.mutedEmailTypes).toEqual([])
	})

	it("is idempotent when muting twice", async () => {
		const user = await makeUser()
		for (let i = 0; i < 2; i++) {
			await expectData<SetEmailPreferenceData>(SET_EMAIL_PREFERENCE, {
				as: user,
				variables: { input: { type: "ALL", enabled: false } },
			})
		}
		const data = await expectData<SetEmailPreferenceData>(
			SET_EMAIL_PREFERENCE,
			{
				as: user,
				variables: { input: { type: "CALL_RESOLVED", enabled: true } },
			},
		)
		expect(data.setEmailPreference.mutedEmailTypes).toEqual(["ALL"])
	})
})

describe("Mutation.unsubscribeFromEmails", () => {
	// The token is the credential - a one-click unsubscribe arrives from a
	// mail provider with no session at all, so requiring one would break it.
	it("works with no session", async () => {
		const user = await makeUser()
		const token = unsubscribeToken(user.id, "call_resolved")

		const data = await expectData<UnsubscribeData>(UNSUBSCRIBE, {
			variables: { token },
		})
		expect(data.unsubscribeFromEmails.__typename).toBe(
			"MutationUnsubscribeFromEmailsSuccess",
		)

		const rows = await db
			.select()
			.from(emailOptOuts)
			.where(eq(emailOptOuts.userId, user.id))
		expect(rows.map((r) => r.type)).toEqual(["call_resolved"])
	})

	it("rejects a token it didn't sign", async () => {
		const data = await expectData<UnsubscribeData>(UNSUBSCRIBE, {
			variables: { token: "made.up" },
		})
		expect(data.unsubscribeFromEmails.__typename).toBe("ValidationError")
	})

	it("is idempotent, so a second click doesn't error", async () => {
		const user = await makeUser()
		const token = unsubscribeToken(user.id, "all")
		for (let i = 0; i < 2; i++) {
			const data = await expectData<UnsubscribeData>(UNSUBSCRIBE, {
				variables: { token },
			})
			expect(data.unsubscribeFromEmails.__typename).toBe(
				"MutationUnsubscribeFromEmailsSuccess",
			)
		}
	})
})
