import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import type { Game, User } from "../../../db/schema"
import { setModerationProvider } from "../../../lib/moderation"
import {
	makeAdmin,
	makeCall,
	makeGame,
	makeGroup,
	makePresser,
	makePresserQuestion,
	makeQuestion,
	makeUser,
	makeUserSeasonStats,
	pastDate,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"
import { daysAgo } from "../../../test/helpers"

const PRESSER = /* GraphQL */ `
	query Presser($id: ID!) {
		presser(id: $id) {
			isOpen
			statement
			answeredCount
			pendingCount
			viewerAskStatus
			questions { id body answer noComment isAnswered source }
		}
	}
`

type PresserData = {
	presser: {
		isOpen: boolean
		statement: string | null
		answeredCount: number
		pendingCount: number | null
		viewerAskStatus: string
		questions: {
			id: string
			body: string
			answer: string | null
			noComment: boolean
			isAnswered: boolean
			source: string
		}[]
	} | null
}

const ASK = /* GraphQL */ `
	mutation Ask($input: AskPresserQuestionInput!) {
		askPresserQuestion(input: $input) {
			__typename
			... on PresserPayload { presser { id } }
			... on Error { message }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

const ANSWER = /* GraphQL */ `
	mutation Answer($input: AnswerPresserQuestionInput!) {
		answerPresserQuestion(input: $input) {
			__typename
			... on Error { message }
		}
	}
`

const STATEMENT = /* GraphQL */ `
	mutation Statement($input: PostPresserStatementInput!) {
		postPresserStatement(input: $input) {
			__typename
			... on Error { message }
		}
	}
`

const BLOCK = /* GraphQL */ `
	mutation Block($username: String!) {
		blockUser(username: $username) { __typename }
	}
`

const REPORT = /* GraphQL */ `
	mutation Report($input: ReportPresserContentInput!) {
		reportPresserContent(input: $input) {
			__typename
			... on PresserReportPayload { report { id } }
		}
	}
`

const REMOVE = /* GraphQL */ `
	mutation Remove($reportId: ID!) {
		adminRemovePresserContent(reportId: $reportId) { __typename }
	}
`

type Result = { __typename: string; message?: string }

async function setup() {
	const game = await makeGame({ status: "final", startsAt: pastDate(4) })
	const owner = await makeUser()
	const presser = await makePresser({ userId: owner.id, gameId: game.id })
	return { game, owner, presser }
}

// Someone outside the owner's groups who called the game, with an account
// old and busy enough to ask.
async function veteranCaller(game: Game): Promise<User> {
	const user = await makeUser({ createdAt: daysAgo(30) })
	const question = await makeQuestion({
		gameId: game.id,
		leagueId: game.leagueId,
		seasonId: game.seasonId,
	})
	await makeCall(question.id, user.id)
	await makeUserSeasonStats({
		userId: user.id,
		leagueId: game.leagueId,
		seasonId: game.seasonId,
		resolvedCallCount: 20,
	})
	return user
}

const view = (id: string, as: User | null) =>
	expectData<PresserData>(PRESSER, { as, variables: { id } })

const ask = async (presserId: string, body: string, as: User) =>
	(
		await expectData<{ askPresserQuestion: Result }>(ASK, {
			as,
			variables: { input: { presserId, body } },
		})
	).askPresserQuestion

describe("presser visibility", () => {
	it("shows a pending question to the owner and its asker only, and answers to everyone", async () => {
		const { owner, presser } = await setup()
		const asker = await makeUser()
		const stranger = await makeUser()
		const pending = await makePresserQuestion(presser.id, { askerId: asker.id })
		const answered = await makePresserQuestion(presser.id, {
			askerId: (await makeUser()).id,
			status: "answered",
			answerText: "We move",
			answeredAt: new Date(),
		})
		await makePresserQuestion(presser.id, {
			askerId: (await makeUser()).id,
			status: "removed",
		})

		const ids = async (as: User | null) =>
			(await view(presser.id, as)).presser?.questions.map((q) => q.id)

		expect((await ids(owner))?.sort()).toEqual([pending.id, answered.id].sort())
		expect((await ids(asker))?.sort()).toEqual([pending.id, answered.id].sort())
		expect(await ids(stranger)).toEqual([answered.id])
		expect(await ids(null)).toEqual([answered.id])
		expect((await view(presser.id, owner)).presser?.pendingCount).toBe(1)
		expect((await view(presser.id, stranger)).presser?.pendingCount).toBeNull()
	})

	it("drops pending questions once the presser closes", async () => {
		const game = await makeGame({ status: "final" })
		const owner = await makeUser()
		const presser = await makePresser({
			userId: owner.id,
			gameId: game.id,
			closesAt: pastDate(1),
		})
		await makePresserQuestion(presser.id, { askerId: (await makeUser()).id })
		const data = await view(presser.id, owner)
		expect(data.presser?.isOpen).toBe(false)
		expect(data.presser?.questions).toEqual([])
	})

	it("writes the app's questions on the owner's first look", async () => {
		const { owner, presser, game } = await setup()
		const question = await makeQuestion({
			gameId: game.id,
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			status: "resolved",
		})
		await makeCall(question.id, owner.id, {
			resultPoints: 40,
			hitTolerance: true,
		})

		expect((await view(presser.id, null)).presser?.questions).toEqual([])
		const own = await view(presser.id, owner)
		expect(own.presser?.questions.map((q) => q.source)).toEqual(["APP"])
	})
})

describe("askPresserQuestion", () => {
	it("lets a groupmate ask once, and tells the owner", async () => {
		const { owner, presser } = await setup()
		const mate = await makeUser()
		await makeGroup({ admin: owner, members: [mate] })

		expect((await view(presser.id, mate)).presser?.viewerAskStatus).toBe(
			"CAN_ASK",
		)
		expect((await ask(presser.id, "Why the under?", mate)).__typename).toBe(
			"PresserPayload",
		)
		const row = await db.query.presserQuestions.findFirst({
			where: { presserId: presser.id, askerId: mate.id },
		})
		expect(row).toMatchObject({ source: "group", sortRank: 1 })
		expect((await ask(presser.id, "And again?", mate)).__typename).toBe(
			"ValidationError",
		)
		const notice = await db.query.notifications.findFirst({
			where: { userId: owner.id, type: "presser_question_received" },
		})
		expect(notice?.dedupeKey).toBe(`presser:${presser.id}`)
		const event = await db.query.analyticsOutbox.findFirst({
			where: { event: "presser_question_asked" },
		})
		expect(event).toMatchObject({
			userId: mate.id,
			properties: {
				presserId: presser.id,
				source: "group",
			},
		})
	})

	it("turns away people who didn't call the game, and new accounts that did", async () => {
		const { game, presser } = await setup()
		const outsider = await makeUser({ createdAt: daysAgo(30) })
		expect((await view(presser.id, outsider)).presser?.viewerAskStatus).toBe(
			"NOT_ELIGIBLE",
		)

		const fresh = await makeUser()
		const question = await makeQuestion({
			gameId: game.id,
			leagueId: game.leagueId,
			seasonId: game.seasonId,
		})
		await makeCall(question.id, fresh.id)
		expect((await view(presser.id, fresh)).presser?.viewerAskStatus).toBe(
			"NEW_ACCOUNT",
		)
		expect((await ask(presser.id, "hey", fresh)).__typename).toBe(
			"ValidationError",
		)
	})

	it("caps questions from outside the owner's groups", async () => {
		const { game, presser } = await setup()
		for (let i = 0; i < 5; i++) {
			const caller = await veteranCaller(game)
			expect((await ask(presser.id, `Question ${i}`, caller)).__typename).toBe(
				"PresserPayload",
			)
		}
		const sixth = await veteranCaller(game)
		expect((await view(presser.id, sixth)).presser?.viewerAskStatus).toBe(
			"STRANGER_CAP_REACHED",
		)
	})

	it("blocks both ways, and blocking withdraws what was already asked", async () => {
		const { owner, presser } = await setup()
		const mate = await makeUser()
		await makeGroup({ admin: owner, members: [mate] })
		await ask(presser.id, "You good?", mate)

		await expectData(BLOCK, {
			as: owner,
			variables: { username: mate.username },
		})
		const row = await db.query.presserQuestions.findFirst({
			where: { presserId: presser.id, askerId: mate.id },
		})
		expect(row?.status).toBe("withdrawn")

		const otherPresser = await makePresser({
			userId: mate.id,
			gameId: (await makeGame({ status: "final" })).id,
		})
		expect((await view(otherPresser.id, owner)).presser?.viewerAskStatus).toBe(
			"BLOCKED",
		)
	})

	it("refuses a slur, and holds strangers to the strict list", async () => {
		const { owner, game, presser } = await setup()
		const mate = await makeUser()
		await makeGroup({ admin: owner, members: [mate] })
		const slur = Buffer.from("ZmFnZ290", "base64").toString("utf8")
		const result = await ask(presser.id, `you ${slur}`, mate)
		expect(result.__typename).toBe("ValidationError")
		const blocked = await db.query.analyticsOutbox.findFirst({
			where: { event: "presser_text_blocked" },
		})
		expect(blocked?.properties).toEqual({
			field: "question",
			category: "hate",
			strictness: "standard",
		})

		const word = Buffer.from("cmV0YXJk", "base64").toString("utf8")
		const stranger = await veteranCaller(game)
		expect((await ask(presser.id, `what a ${word}`, stranger)).__typename).toBe(
			"ValidationError",
		)
	})

	it("passes what the local check allows to a provider when one is set", async () => {
		const { owner, presser } = await setup()
		const mate = await makeUser()
		await makeGroup({ admin: owner, members: [mate] })
		setModerationProvider({
			check: async () => ({ ok: false, category: "harassment" }),
		})
		try {
			expect((await ask(presser.id, "fine words", mate)).__typename).toBe(
				"ValidationError",
			)
		} finally {
			setModerationProvider(null)
		}
	})
})

describe("answering and the statement", () => {
	it("makes an answer public, once, and tells the asker", async () => {
		const { owner, presser } = await setup()
		const asker = await makeUser()
		const question = await makePresserQuestion(presser.id, {
			askerId: asker.id,
		})
		const answer = (input: Record<string, unknown>, as: User) =>
			expectData<{ answerPresserQuestion: Result }>(ANSWER, {
				as,
				variables: { input: { questionId: question.id, ...input } },
			})

		expect(
			(await answer({ answer: "nope" }, asker)).answerPresserQuestion
				.__typename,
		).toBe("AuthorizationError")
		expect(
			(await answer({ noComment: true }, owner)).answerPresserQuestion
				.__typename,
		).toBe("PresserPayload")
		expect(
			(await answer({ answer: "changed my mind" }, owner)).answerPresserQuestion
				.__typename,
		).toBe("ValidationError")

		const publicView = await view(presser.id, null)
		expect(publicView.presser?.questions).toMatchObject([
			{ id: question.id, noComment: true, isAnswered: true, answer: null },
		])
		const notice = await db.query.notifications.findFirst({
			where: { userId: asker.id, type: "presser_answered" },
		})
		expect(notice?.presserId).toBe(presser.id)
		const event = await db.query.analyticsOutbox.findFirst({
			where: { event: "presser_question_answered" },
		})
		expect(event).toMatchObject({
			userId: owner.id,
			properties: { source: "group", noComment: true },
		})
	})

	it("posts the statement once, owner only", async () => {
		const { owner, presser } = await setup()
		const post = (text: string, as: User) =>
			expectData<{ postPresserStatement: Result }>(STATEMENT, {
				as,
				variables: { input: { presserId: presser.id, text } },
			})
		expect(
			(await post("hi", await makeUser())).postPresserStatement.__typename,
		).toBe("AuthorizationError")
		expect(
			(await post("Tough night.", owner)).postPresserStatement.__typename,
		).toBe("PresserPayload")
		expect((await post("Again", owner)).postPresserStatement.__typename).toBe(
			"ValidationError",
		)
		expect((await view(presser.id, null)).presser?.statement).toBe(
			"Tough night.",
		)
	})
})

describe("reports", () => {
	it("lets the owner report a pending question, and an admin take it down", async () => {
		const { owner, presser } = await setup()
		const question = await makePresserQuestion(presser.id, {
			askerId: (await makeUser()).id,
		})
		const reported = await expectData<{
			reportPresserContent: { __typename: string; report?: { id: string } }
		}>(REPORT, {
			as: owner,
			variables: {
				input: {
					presserId: presser.id,
					presserQuestionId: question.id,
					target: "QUESTION",
					reason: "HARASSMENT",
				},
			},
		})
		const reportId = reported.reportPresserContent.report?.id
		expect(reportId).toBeDefined()

		const outsider = await execute(REPORT, {
			as: await makeUser(),
			variables: {
				input: {
					presserId: presser.id,
					presserQuestionId: question.id,
					target: "QUESTION",
					reason: "HARASSMENT",
				},
			},
		})
		expect(
			(outsider.data?.reportPresserContent as Result | undefined)?.__typename,
		).toBe("NotFoundError")

		await expectData(REMOVE, {
			as: await makeAdmin(),
			variables: { reportId },
		})
		const row = await db.query.presserQuestions.findFirst({
			where: { id: question.id },
		})
		expect(row?.status).toBe("removed")
		const report = await db.query.presserReports.findFirst({
			where: { id: reportId },
		})
		expect(report?.status).toBe("removed")
	})
})

const PROFILE = /* GraphQL */ `
	query Profile($username: String!) {
		userByUsername(username: $username) {
			openPressers { id }
			pressers { id latestAnswer { body } }
		}
	}
`

describe("profile pressers", () => {
	it("lists open ones, and every one with something public in it", async () => {
		const owner = await makeUser()
		const quiet = await makePresser({
			userId: owner.id,
			gameId: (await makeGame({ status: "final" })).id,
		})
		await makePresserQuestion(quiet.id, { askerId: (await makeUser()).id })
		const closed = await makePresser({
			userId: owner.id,
			gameId: (await makeGame({ status: "final", startsAt: pastDate(80) })).id,
			closesAt: pastDate(10),
		})
		await makePresserQuestion(closed.id, {
			status: "answered",
			answerText: "Still mad",
			answeredAt: pastDate(20),
			body: "How'd it go?",
		})

		const data = await expectData<{
			userByUsername: {
				openPressers: { id: string }[]
				pressers: { id: string; latestAnswer: { body: string } | null }[]
			}
		}>(PROFILE, { variables: { username: owner.username } })
		expect(data.userByUsername.openPressers).toEqual([{ id: quiet.id }])
		expect(data.userByUsername.pressers).toEqual([
			{ id: closed.id, latestAnswer: { body: "How'd it go?" } },
		])
	})
})
