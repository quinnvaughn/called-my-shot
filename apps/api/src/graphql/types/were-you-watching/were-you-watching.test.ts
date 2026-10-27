import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { type User, watchQuizAttempts, watchQuizzes } from "../../../db/schema"
import { parseBoxScore } from "../../../db/sync/box-score-parse"
import { persistBoxScore } from "../../../db/sync/box-score-store"
import type { EspnGameSummary } from "../../../db/sync/espn-client"
import { DAY_MS, HOUR_MS } from "../../../lib/time"
import { buildWatchQuizzes } from "../../../lib/were-you-watching/generate"
import {
	makeExternalRef,
	makeGame,
	makeGroup,
	makeLeague,
	makePlayer,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"
import { espnFixture } from "../../../test/helpers"

// Were You Watching?: a quiz on a team's latest game, built from its box
// score, one question at a time on a server clock, with a public board and
// a place in groups.

// The NBA fixture's two competitors, home first.
const HOME_ESPN = "2"
const AWAY_ESPN = "3"

async function setup({ daysAgo = 1 } = {}) {
	const league = await makeLeague({ slug: "nba" })
	const home = await makeTeam({
		leagueId: league.id,
		name: "Boston Celtics",
		abbreviation: "BOS",
	})
	const away = await makeTeam({
		leagueId: league.id,
		name: "New York Knicks",
		abbreviation: "NYK",
	})
	await makeExternalRef("team", `nba:${HOME_ESPN}`, home.id)
	await makeExternalRef("team", `nba:${AWAY_ESPN}`, away.id)
	const summary = espnFixture<EspnGameSummary>("nba-summary.json")
	const box = parseBoxScore(summary)
	for (const [espnId, athlete] of box.athletes) {
		const player = await makePlayer({ name: athlete.name ?? espnId })
		await makeExternalRef("player", `nba:${espnId}`, player.id)
	}
	const startsAt = new Date(Date.now() - daysAgo * DAY_MS)
	const game = await makeGame({
		leagueId: league.id,
		homeTeamId: home.id,
		awayTeamId: away.id,
		startsAt,
		status: "final",
		finalizedAt: new Date(startsAt.getTime() + 3 * HOUR_MS),
	})
	await persistBoxScore({
		game,
		leagueSlug: "nba",
		box,
		espnTeamIdByTeamId: new Map([
			[home.id, HOME_ESPN],
			[away.id, AWAY_ESPN],
		]),
		now: new Date(),
	})
	return { league, home, away, game }
}

const PLAY = `
	status
	correctCount
	total
	seconds
	clean
	resultCode
	rank
	current { index prompt msLeft options { label } }
	answered { index choice answer correct timedOut reveal }
`

type Play = {
	status: "OPEN" | "BETWEEN" | "DONE"
	correctCount: number
	total: number
	seconds: number
	clean: boolean
	resultCode: string | null
	rank: number | null
	current: {
		index: number
		prompt: string
		msLeft: number
		options: { label: string }[]
	} | null
	answered: {
		index: number
		choice: number | null
		answer: number
		correct: boolean
		timedOut: boolean
		reveal: string
	}[]
}

const TEAM_QUIZ = /* GraphQL */ `
	query TeamQuiz($league: String!, $team: String!) {
		watchTeamQuiz(leagueSlug: $league, teamSlug: $team) {
			status
			quiz {
				id
				code
				live
				questionCount
				team { abbreviation }
				opponent { abbreviation }
				viewerPlay { ${PLAY} }
				board { rank user { id } correct seconds clean }
				playerCount
			}
		}
	}
`

type TeamQuiz = {
	watchTeamQuiz: {
		status: string
		quiz: {
			id: string
			code: string
			live: boolean
			questionCount: number
			team: { abbreviation: string }
			opponent: { abbreviation: string }
			viewerPlay: Play | null
			board: {
				rank: number
				user: { id: string }
				correct: number
				seconds: number
				clean: boolean
			}[]
			playerCount: number
		} | null
	} | null
}

const teamQuiz = (as: User | null = null, team = "bos") =>
	expectData<TeamQuiz>(TEAM_QUIZ, {
		as,
		variables: { league: "nba", team },
	})

const mutation = (name: string, args: string, params: string) => /* GraphQL */ `
	mutation M(${params}) {
		${name}(${args}) {
			__typename
			... on WatchPlay { ${PLAY} }
			... on ValidationError { fieldErrors { message } }
			... on NotFoundError { message }
		}
	}
`
const START = mutation("startWatchQuiz", "quizId: $quizId", "$quizId: ID!")
const NEXT = mutation("nextWatchQuestion", "quizId: $quizId", "$quizId: ID!")
const ANSWER = mutation(
	"answerWatchQuestion",
	"quizId: $quizId, index: $index, choice: $choice",
	"$quizId: ID!, $index: Int!, $choice: Int",
)

type Result = Play & {
	__typename: string
	message?: string
	fieldErrors?: { message: string }[]
}

function player(user: User, quizId: string) {
	const run = async (source: string, variables: Record<string, unknown> = {}) =>
		Object.values(
			await expectData<Record<string, Result>>(source, {
				as: user,
				variables: { quizId, ...variables },
			}),
		)[0] as Result
	return {
		start: () => run(START),
		next: () => run(NEXT),
		answer: (index: number, choice: number | null) =>
			run(ANSWER, { index, choice }),
	}
}

async function quizRow(id: string) {
	const quiz = await db.query.watchQuizzes.findFirst({ where: { id } })
	if (!quiz) throw new Error("no quiz")
	return quiz
}

// Answers every question, right or wrong as `right` says.
async function playThrough(
	user: User,
	quizId: string,
	right: (index: number) => boolean,
) {
	const quiz = await quizRow(quizId)
	const p = player(user, quizId)
	let result = await p.start()
	for (const [i, q] of quiz.questions.entries()) {
		if (i > 0) result = await p.next()
		result = await p.answer(i, right(i) ? q.answer : (q.answer + 1) % 4)
	}
	return result
}

describe("watchTeamQuiz", () => {
	it("builds a team's quiz on its latest game the first time it's asked for", async () => {
		await setup()
		const { watchTeamQuiz } = await teamQuiz()
		expect(watchTeamQuiz?.status).toBe("LIVE")
		expect(watchTeamQuiz?.quiz).toMatchObject({
			live: true,
			team: { abbreviation: "BOS" },
			opponent: { abbreviation: "NYK" },
		})
		expect(watchTeamQuiz?.quiz?.questionCount).toBeGreaterThanOrEqual(5)
	})

	it("greys out a team whose latest game is from before the offseason", async () => {
		await setup({ daysAgo: 40 })
		const { watchTeamQuiz } = await teamQuiz()
		expect(watchTeamQuiz?.status).toBe("STALE")
		expect(watchTeamQuiz?.quiz?.live).toBe(false)
	})

	it("is null for a team that doesn't exist", async () => {
		await setup()
		expect((await teamQuiz(null, "zzz")).watchTeamQuiz).toBeNull()
	})

	it("never sends a question's answer before it's answered", async () => {
		const result = await execute(/* GraphQL */ `
			{ __type(name: "WatchServedQuestion") { fields { name } } }
		`)
		const fields = (
			result.data as { __type: { fields: { name: string }[] } }
		).__type.fields.map((f) => f.name)
		expect(fields).not.toContain("answer")
		expect(fields).not.toContain("reveal")
	})
})

describe("playing a quiz", () => {
	it("serves one question at a time and reveals each once answered", async () => {
		await setup()
		const user = await makeUser()
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		const quiz = await quizRow(quizId)
		const p = player(user, quizId)

		const started = await p.start()
		expect(started.status).toBe("OPEN")
		expect(started.current?.index).toBe(0)
		expect(started.current?.msLeft).toBeGreaterThan(9000)

		const first = quiz.questions[0]
		const answered = await p.answer(0, first?.answer ?? 0)
		expect(answered.status).toBe("BETWEEN")
		expect(answered.current).toBeNull()
		expect(answered.answered[0]).toMatchObject({
			correct: true,
			reveal: first?.reveal,
		})

		const next = await p.next()
		expect(next.current?.index).toBe(1)
		expect(next.current?.prompt).toBe(quiz.questions[1]?.prompt)
	})

	it("keeps a question's clock running across a reload", async () => {
		await setup()
		const user = await makeUser()
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		await player(user, quizId).start()
		await db
			.update(watchQuizAttempts)
			.set({ openServedAt: new Date(Date.now() - 6000) })
			.where(eq(watchQuizAttempts.userId, user.id))

		const again = await player(user, quizId).start()
		expect(again.current?.index).toBe(0)
		expect(again.current?.msLeft).toBeLessThanOrEqual(4000)
		const reloaded = (await teamQuiz(user)).watchTeamQuiz?.quiz?.viewerPlay
		expect(reloaded?.current?.msLeft).toBeLessThanOrEqual(4000)
	})

	it("counts a question left on the clock too long as timed out", async () => {
		await setup()
		const user = await makeUser()
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		const quiz = await quizRow(quizId)
		await player(user, quizId).start()
		await db
			.update(watchQuizAttempts)
			.set({ openServedAt: new Date(Date.now() - 20_000) })
			.where(eq(watchQuizAttempts.userId, user.id))

		const late = await player(user, quizId).answer(
			0,
			quiz.questions[0]?.answer ?? 0,
		)
		expect(late.__typename).toBe("WatchPlay")
		expect(late.answered[0]).toMatchObject({ timedOut: true, correct: false })
		expect(late.status).toBe("BETWEEN")
	})

	it("finishes with a result code and a place on the board", async () => {
		await setup()
		const [fast, slow] = [await makeUser(), await makeUser()]
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		const total = (await quizRow(quizId)).questions.length

		const done = await playThrough(fast, quizId, () => true)
		expect(done.status).toBe("DONE")
		expect(done.correctCount).toBe(total)
		expect(done.resultCode).toMatch(new RegExp(`^${total}-${total}-\\d+$`))
		expect(done.rank).toBe(1)

		await playThrough(slow, quizId, (i) => i > 0)
		const board = (await teamQuiz()).watchTeamQuiz?.quiz?.board ?? []
		expect(board.map((r) => [r.user.id, r.correct])).toEqual([
			[fast.id, total],
			[slow.id, total - 1],
		])
	})

	it("drops the Clean run tag when the player leaves mid-question", async () => {
		await setup()
		const user = await makeUser()
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		await player(user, quizId).start()
		await expectData(
			/* GraphQL */ `mutation H($quizId: ID!) { reportWatchHidden(quizId: $quizId) }`,
			{ as: user, variables: { quizId } },
		)
		const done = await playThrough(user, quizId, () => true)
		expect(done.clean).toBe(false)
		expect(done.resultCode).toMatch(/-h$/)
	})

	it("refuses a quiz the team's newer game replaced", async () => {
		const { home, league } = await setup({ daysAgo: 3 })
		const user = await makeUser()
		const oldId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		await db.insert(watchQuizzes).values({
			...(await quizRow(oldId)),
			id: undefined,
			leagueId: league.id,
			teamId: home.id,
			gameId: (
				await makeGame({
					leagueId: league.id,
					homeTeamId: home.id,
					startsAt: new Date(Date.now() - DAY_MS),
					status: "final",
				})
			).id,
			code: "newer",
			gameStartsAt: new Date(Date.now() - DAY_MS),
		})
		const refused = await player(user, oldId).start()
		expect(refused).toMatchObject({
			__typename: "NotFoundError",
			message: "This quiz was replaced by the team's newer game.",
		})
	})
})

describe("signed-out play", () => {
	it("judges a guest's answers and saves them on sign-up", async () => {
		await setup()
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		const quiz = await quizRow(quizId)

		const served = await expectData<{
			watchGuestQuestion: { prompt: string; msLeft: number }
		}>(
			/* GraphQL */ `query Q($quizId: ID!) {
				watchGuestQuestion(quizId: $quizId, index: 0) {
					... on WatchServedQuestion { prompt msLeft }
				}
			}`,
			{ variables: { quizId } },
		)
		expect(served.watchGuestQuestion.prompt).toBe(quiz.questions[0]?.prompt)

		const judged = await expectData<{
			judgeWatchGuestAnswer: { correct: boolean; answer: number }
		}>(
			/* GraphQL */ `query J($quizId: ID!, $choice: Int) {
				judgeWatchGuestAnswer(quizId: $quizId, index: 0, choice: $choice, ms: 2500) {
					... on WatchAnsweredQuestion { correct answer }
				}
			}`,
			{ variables: { quizId, choice: quiz.questions[0]?.answer } },
		)
		expect(judged.judgeWatchGuestAnswer.correct).toBe(true)

		const user = await makeUser()
		const answers = quiz.questions.map((q) => ({ choice: q.answer, ms: 0 }))
		const imported = await expectData<{ importWatchQuizAnswers: Result }>(
			/* GraphQL */ `mutation I($quizId: ID!, $answers: [WatchGuestAnswer!]!) {
				importWatchQuizAnswers(quizId: $quizId, answers: $answers, clean: true) {
					__typename
					... on WatchPlay { ${PLAY} }
				}
			}`,
			{ as: user, variables: { quizId, answers } },
		)
		expect(imported.importWatchQuizAnswers).toMatchObject({
			status: "DONE",
			correctCount: quiz.questions.length,
			clean: true,
		})
		// Each answer counts at least half a second, however fast the browser
		// said it was.
		expect(imported.importWatchQuizAnswers.seconds).toBe(
			quiz.questions.length * 0.5,
		)
	})
})

describe("groups", () => {
	it("shows members' runs and counts one quiz a day toward the week", async () => {
		await setup()
		const [admin, member] = [await makeUser(), await makeUser()]
		const group = await makeGroup({ admin, members: [member] })
		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		const knicksId = (await teamQuiz(null, "nyk")).watchTeamQuiz?.quiz?.id ?? ""
		await playThrough(member, quizId, () => true)
		await playThrough(member, knicksId, (i) => i === 0)

		const data = await expectData<{
			group: {
				watchQuizBoard: {
					members: { user: { id: string }; status: string }[]
				}
				watchRecent: { members: { user: { id: string } }[] }[]
				arcadeWeek: { user: { id: string }; points: number; played: number }[]
			}
		}>(
			/* GraphQL */ `query G($id: ID!, $quizId: ID!) {
				group(id: $id) {
					watchQuizBoard(quizId: $quizId) { members { user { id } status } }
					watchRecent { members { user { id } } }
					arcadeWeek { user { id } points played }
				}
			}`,
			{ as: admin, variables: { id: group.id, quizId } },
		)
		expect(
			data.group.watchQuizBoard.members.map((m) => [m.user.id, m.status]),
		).toEqual([
			[member.id, "FINISHED"],
			[admin.id, "NOT_PLAYED"],
		])
		expect(data.group.watchRecent).toHaveLength(2)
		const total = (await quizRow(quizId)).questions.length
		expect(
			data.group.arcadeWeek.find((r) => r.user.id === member.id),
		).toMatchObject({ points: total, played: 1 })
	})
})

describe("buildWatchQuizzes", () => {
	it("builds each team's latest game once, and leaves a started quiz alone", async () => {
		const { game } = await setup()
		expect((await buildWatchQuizzes()).built).toBe(2)
		expect((await buildWatchQuizzes()).built).toBe(0)

		const quizId = (await teamQuiz()).watchTeamQuiz?.quiz?.id ?? ""
		await player(await makeUser(), quizId).start()
		const before = await quizRow(quizId)
		await db
			.update(watchQuizzes)
			.set({ boxScoreSyncedAt: new Date(Date.now() - DAY_MS) })
			.where(eq(watchQuizzes.gameId, game.id))
		expect((await buildWatchQuizzes()).built).toBe(1)
		expect((await quizRow(quizId)).questions).toEqual(before.questions)
	})
})
