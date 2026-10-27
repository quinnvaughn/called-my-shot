import { db } from "../../../db"
import type {
	League,
	Player,
	Team,
	WatchOption,
	WatchQuestion,
	WatchQuizAttempt,
} from "../../../db/schema"
import { QUESTION_MS } from "../../../lib/were-you-watching/leagues"
import {
	countWatchPlayers,
	findWatchAttempt,
	type LoadedWatchQuiz,
	loadWatchBoard,
	settleWatchAttempt,
	verifiedWatchSharer,
	type WatchBoardEntry,
	type WatchPlayView,
	watchBoardRank,
	watchPlayView,
	watchQuizLive,
} from "../../../lib/were-you-watching/load"
import { watchRunCode, watchSeconds } from "../../../lib/were-you-watching/play"
import { builder } from "../../builder"
import { ctxLoader, indexByKey } from "../../loader"
import { LeagueRef, PlayerRef, TeamRef } from "../sports"
import { UserRef } from "../user"

const playerById = ctxLoader<string, Player | null>(async (ids) => {
	const rows = await db.query.players.findMany({ where: { id: { in: ids } } })
	return indexByKey(ids, rows, (p) => p.id, null)
})

// The signed-in viewer's run on each quiz, in one query for a page of them.
const viewerAttempt = ctxLoader<string, WatchQuizAttempt | null>(
	async (quizIds, ctx) => {
		const userId = ctx.user?.id
		if (!userId) return quizIds.map(() => null)
		const rows = await db.query.watchQuizAttempts.findMany({
			where: { quizId: { in: quizIds }, userId },
		})
		return indexByKey(quizIds, rows, (a) => a.quizId, null)
	},
)

type ViewerRun = { finished: boolean; correct: number }

// Whether the viewer has finished a quiz and how they did, for a list of
// teams. The run itself is viewerPlay.
const WatchViewerRunRef = builder
	.objectRef<ViewerRun>("WatchViewerRun")
	.implement({
		fields: (t) => ({
			finished: t.exposeBoolean("finished"),
			correct: t.exposeInt("correct"),
		}),
	})

export const quizLive = ctxLoader<LoadedWatchQuiz, boolean, string>(
	(quizzes) => Promise.all(quizzes.map((q) => watchQuizLive(q, new Date()))),
	{ cacheKeyFn: (q) => q.id },
)

export const WatchPlayStatusEnum = builder.enumType("WatchPlayStatus", {
	values: {
		// A question is on the clock.
		OPEN: { value: "open" },
		// Between questions: the last one's answer is showing.
		BETWEEN: { value: "between" },
		DONE: { value: "done" },
	} as const,
})

export const WatchTeamStatusEnum = builder.enumType("WatchTeamStatus", {
	values: {
		LIVE: { value: "live" },
		// The team's newest quiz is from too long ago: the offseason.
		STALE: { value: "stale" },
		// No quiz yet.
		NONE: { value: "none" },
	} as const,
})

const WatchOptionRef = builder.objectRef<WatchOption>("WatchOption").implement({
	fields: (t) => ({
		label: t.exposeString("label"),
		player: t.field({
			type: PlayerRef,
			nullable: true,
			resolve: (o, _args, ctx) =>
				o.playerId ? playerById(ctx).load(o.playerId) : null,
		}),
	}),
})

export type ServedQuestion = {
	index: number
	question: WatchQuestion
	msLeft: number
}

// A question as it's shown, before it's answered: no answer and no reveal.
export const WatchServedQuestionRef = builder
	.objectRef<ServedQuestion>("WatchServedQuestion")
	.implement({
		fields: (t) => ({
			index: t.exposeInt("index"),
			prompt: t.string({ resolve: (q) => q.question.prompt }),
			options: t.field({
				type: [WatchOptionRef],
				resolve: (q) => q.question.options,
			}),
			// Measured on the server when this was sent, so the player's own
			// clock being off doesn't matter.
			msLeft: t.exposeInt("msLeft"),
		}),
	})

export type AnsweredQuestion = {
	index: number
	question: WatchQuestion
	choice: number | null
	correct: boolean
	ms: number
}

export const WatchAnsweredQuestionRef = builder
	.objectRef<AnsweredQuestion>("WatchAnsweredQuestion")
	.implement({
		fields: (t) => ({
			index: t.exposeInt("index"),
			prompt: t.string({ resolve: (q) => q.question.prompt }),
			options: t.field({
				type: [WatchOptionRef],
				resolve: (q) => q.question.options,
			}),
			// Null when the clock ran out.
			choice: t.int({ nullable: true, resolve: (q) => q.choice }),
			answer: t.int({ resolve: (q) => q.question.answer }),
			correct: t.exposeBoolean("correct"),
			timedOut: t.boolean({ resolve: (q) => q.choice === null }),
			seconds: t.float({ resolve: (q) => watchSeconds(q.ms) }),
			reveal: t.string({ resolve: (q) => q.question.reveal }),
		}),
	})

export function servedQuestion(view: WatchPlayView): ServedQuestion | null {
	const { state, quiz, now } = view
	const question = quiz.questions[state.answers.length]
	if (state.status !== "open" || !state.openServedAt || !question) return null
	const elapsed = now.getTime() - state.openServedAt.getTime()
	return {
		index: state.answers.length,
		question,
		msLeft: Math.max(0, Math.min(QUESTION_MS, QUESTION_MS - elapsed)),
	}
}

export const WatchPlayRef = builder
	.objectRef<WatchPlayView>("WatchPlay")
	.implement({
		fields: (t) => ({
			status: t.field({
				type: WatchPlayStatusEnum,
				resolve: (v) => v.state.status,
			}),
			current: t.field({
				type: WatchServedQuestionRef,
				nullable: true,
				resolve: servedQuestion,
			}),
			answered: t.field({
				type: [WatchAnsweredQuestionRef],
				resolve: (v) =>
					v.state.answers.flatMap((answer, index) => {
						const question = v.quiz.questions[index]
						return question ? [{ index, question, ...answer }] : []
					}),
			}),
			correctCount: t.int({ resolve: (v) => v.state.correctCount }),
			total: t.int({ resolve: (v) => v.state.total }),
			seconds: t.float({ resolve: (v) => watchSeconds(v.state.totalMs) }),
			// Stayed on the page through every question.
			clean: t.exposeBoolean("clean"),
			// What a share link carries, once every question is answered.
			resultCode: t.string({
				nullable: true,
				resolve: (v) =>
					v.finished ? watchRunCode({ ...v.state, clean: v.clean }) : null,
			}),
			// Place on the quiz's board, once finished on an account.
			rank: t.int({
				nullable: true,
				resolve: async (v, _args, ctx) => {
					if (!v.saved || !v.finished || !ctx.user) return null
					const attempt = await findWatchAttempt(v.quiz.id, ctx.user.id)
					return attempt?.finishedAt ? watchBoardRank(attempt) : null
				},
			}),
		}),
	})

const WatchBoardRowRef = builder
	.objectRef<WatchBoardEntry>("WatchBoardRow")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank"),
			user: t.field({ type: UserRef, resolve: (r) => r.user }),
			correct: t.int({ resolve: (r) => r.correctCount }),
			seconds: t.float({ resolve: (r) => watchSeconds(r.totalMs) }),
			clean: t.exposeBoolean("clean"),
		}),
	})

// A team's quiz on one of its games. The questions themselves only come
// one at a time, through play.
export const WatchQuizRef = builder
	.objectRef<LoadedWatchQuiz>("WatchQuiz")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			// The game's day, what a link to this quiz names.
			code: t.exposeString("code"),
			league: t.field({ type: LeagueRef, resolve: (q) => q.league }),
			team: t.field({ type: TeamRef, resolve: (q) => q.team }),
			opponent: t.field({ type: TeamRef, resolve: (q) => q.opponent }),
			gameStartsAt: t.field({
				type: "DateTime",
				resolve: (q) => q.gameStartsAt,
			}),
			questionCount: t.int({ resolve: (q) => q.questions.length }),
			secondsPerQuestion: t.int({ resolve: () => QUESTION_MS / 1000 }),
			// The team's newest quiz, and recent enough to play. A replaced or
			// stale quiz still shows its board.
			live: t.boolean({ resolve: (q, _args, ctx) => quizLive(ctx).load(q) }),
			// The signed-in viewer's run. Null before they start.
			viewerPlay: t.field({
				type: WatchPlayRef,
				nullable: true,
				resolve: async (q, _args, ctx) => {
					if (!ctx.user) return null
					const found = await findWatchAttempt(q.id, ctx.user.id)
					if (!found) return null
					const now = new Date()
					const live = await quizLive(ctx).load(q)
					const attempt = await settleWatchAttempt(q, found, { live, now })
					return watchPlayView(q, attempt, { live, now })
				},
			}),
			// Everyone who's finished it on an account, most right first, then
			// fastest.
			board: t.field({
				type: [WatchBoardRowRef],
				args: { first: t.arg.int() },
				resolve: (q, args) =>
					loadWatchBoard(q, Math.min(args.first ?? 25, 100)),
			}),
			playerCount: t.int({ resolve: (q) => countWatchPlayers(q.id) }),
			// The viewer's run, short: null before they start or signed out.
			viewerRun: t.field({
				type: WatchViewerRunRef,
				nullable: true,
				resolve: async (q, _args, ctx) => {
					const attempt = await viewerAttempt(ctx).load(q.id)
					if (!attempt) return null
					return {
						finished:
							!!attempt.finishedAt ||
							attempt.answers.length >= q.questions.length,
						correct: attempt.correctCount,
					}
				},
			}),
			// Who a shared link says played it (its ?by=), only when the link's
			// result is that player's real one.
			sharer: t.field({
				type: UserRef,
				nullable: true,
				args: {
					username: t.arg.string({ required: true }),
					result: t.arg.string({ required: true }),
				},
				resolve: (q, args) =>
					verifiedWatchSharer(q, args.username, args.result),
			}),
		}),
	})

export type WatchTeamEntry = {
	team: Team
	league: League
	status: "live" | "stale" | "none"
	quiz: LoadedWatchQuiz | null
}

// A team and where its quiz stands.
export const WatchTeamQuizRef = builder
	.objectRef<WatchTeamEntry>("WatchTeamQuiz")
	.implement({
		fields: (t) => ({
			team: t.field({ type: TeamRef, resolve: (e) => e.team }),
			league: t.field({ type: LeagueRef, resolve: (e) => e.league }),
			status: t.field({ type: WatchTeamStatusEnum, resolve: (e) => e.status }),
			// The newest one, stale or not.
			quiz: t.field({
				type: WatchQuizRef,
				nullable: true,
				resolve: (e) => e.quiz,
			}),
		}),
	})
