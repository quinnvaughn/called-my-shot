import { and, eq, isNull } from "drizzle-orm"
import { db } from "../../../db"
import { type League, type Team, watchQuizAttempts } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { isUuid } from "../../../lib/uuid"
import { buildWatchQuiz } from "../../../lib/were-you-watching/generate"
import {
	QUESTION_MS,
	watchLeague,
} from "../../../lib/were-you-watching/leagues"
import {
	attemptValues,
	findCurrentWatchQuiz,
	findTeamBySlugs,
	findWatchQuiz,
	findWatchQuizByCode,
	type LoadedWatchQuiz,
	latestBoxScoreGame,
	loadCurrentWatchQuizzes,
	watchPlayView,
	watchQuizFresh,
	watchQuizLive,
} from "../../../lib/were-you-watching/load"
import {
	evaluateWatchAttempt,
	guestWatchAnswer,
	judgeWatchAnswer,
	tallyWatchAnswers,
	type WatchRefusal,
} from "../../../lib/were-you-watching/play"
import { builder } from "../../builder"
import {
	WatchAnsweredQuestionRef,
	WatchPlayRef,
	WatchQuizRef,
	WatchServedQuestionRef,
	type WatchTeamEntry,
	WatchTeamQuizRef,
} from "./refs"

function teamEntry(
	team: Team,
	league: League,
	quiz: LoadedWatchQuiz | null,
	now: Date,
): WatchTeamEntry {
	const status = !quiz ? "none" : watchQuizFresh(quiz, now) ? "live" : "stale"
	return { team, league, status, quiz }
}

// A team's quiz, building it here when its latest box score is in and the
// sweep hasn't got to it yet.
async function currentQuizFor(teamId: string): Promise<LoadedWatchQuiz | null> {
	const [game, quiz] = await Promise.all([
		latestBoxScoreGame(teamId),
		findCurrentWatchQuiz(teamId),
	])
	if (!game || quiz?.gameId === game.id) return quiz
	try {
		await buildWatchQuiz(game, teamId)
	} catch {
		// Two first visits building at once: the unique (team, game) index
		// turns one away, and the other's quiz is the one read below.
	}
	return findCurrentWatchQuiz(teamId)
}

// A quiz by id that can still be played, or why not.
async function playableQuiz(quizId: string): Promise<LoadedWatchQuiz> {
	const quiz = isUuid(quizId) ? await findWatchQuiz(quizId) : null
	if (!quiz) throw new NotFoundError("That quiz doesn't exist.")
	if (!(await watchQuizLive(quiz, new Date()))) {
		throw new NotFoundError(
			watchQuizFresh(quiz, new Date())
				? "This quiz was replaced by the team's newer game."
				: "This quiz has closed.",
		)
	}
	return quiz
}

const REFUSAL_MESSAGES: Record<Exclude<WatchRefusal, "wrong_index">, string> = {
	finished: "You've already finished this quiz.",
	not_open: "Time ran out on that one.",
	bad_choice: "Pick one of the four choices.",
}

// One signed-out answer, as the import takes it.
const WatchGuestAnswerRef = builder.inputType("WatchGuestAnswer", {
	fields: (t) => ({
		// Null when the clock ran out.
		choice: t.int({ required: false }),
		ms: t.int({ required: true }),
	}),
})

const playErrors = (name: string) => ({
	types: [AuthenticationError, NotFoundError, ValidationError],
	directResult: true as const,
	union: { name },
})

builder.queryFields((t) => ({
	// Null for a team that doesn't exist.
	watchTeamQuiz: t.field({
		type: WatchTeamQuizRef,
		nullable: true,
		args: {
			leagueSlug: t.arg.string({ required: true }),
			teamSlug: t.arg.string({ required: true }),
		},
		resolve: async (_root, args) => {
			const team = await findTeamBySlugs(args.leagueSlug, args.teamSlug)
			if (!team || !watchLeague(team.league.slug)) return null
			return teamEntry(
				team,
				team.league,
				await currentQuizFor(team.id),
				new Date(),
			)
		},
	}),

	// One of a team's quizzes, current or not, as a link to it names it.
	watchQuizByCode: t.field({
		type: WatchQuizRef,
		nullable: true,
		args: {
			leagueSlug: t.arg.string({ required: true }),
			teamSlug: t.arg.string({ required: true }),
			code: t.arg.string({ required: true }),
		},
		resolve: async (_root, args) => {
			const team = await findTeamBySlugs(args.leagueSlug, args.teamSlug)
			return team ? findWatchQuizByCode(team.id, args.code) : null
		},
	}),

	// Every team in a league, by name, for picking one.
	watchTeams: t.field({
		type: [WatchTeamQuizRef],
		args: { leagueSlug: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			if (!watchLeague(args.leagueSlug)) return []
			const league = await db.query.leagues.findFirst({
				where: { slug: args.leagueSlug },
			})
			if (!league) return []
			const teams = await db.query.teams.findMany({
				where: { leagueId: league.id },
				orderBy: { name: "asc" },
			})
			const quizzes = await loadCurrentWatchQuizzes(teams.map((t) => t.id))
			const now = new Date()
			return teams.map((team) =>
				teamEntry(team, league, quizzes.get(team.id) ?? null, now),
			)
		},
	}),

	// The signed-in viewer's favorite teams, in their order. Empty when
	// signed out.
	watchHub: t.field({
		type: [WatchTeamQuizRef],
		resolve: async (_root, _args, ctx) => {
			if (!ctx.user) return []
			const favorites = await db.query.userFavoriteTeams.findMany({
				where: { userId: ctx.user.id },
				orderBy: { position: "asc" },
			})
			const teams = await db.query.teams.findMany({
				where: { id: { in: favorites.map((f) => f.teamId) } },
				with: { league: true },
			})
			const now = new Date()
			const entries = await Promise.all(
				favorites.map(async (favorite) => {
					const team = teams.find((t) => t.id === favorite.teamId)
					const league = team?.league
					if (!team || !league || !watchLeague(league.slug)) return null
					return teamEntry(team, league, await currentQuizFor(team.id), now)
				}),
			)
			return entries.filter((e) => e !== null)
		},
	}),

	// One question of a live quiz for a signed-out player, whose run is
	// timed and kept in their browser.
	watchGuestQuestion: t.field({
		type: WatchServedQuestionRef,
		errors: {
			types: [NotFoundError],
			directResult: true,
			union: { name: "WatchGuestQuestionResult" },
		},
		args: {
			quizId: t.arg.id({ required: true }),
			index: t.arg.int({ required: true }),
		},
		resolve: async (_root, args) => {
			const quiz = await playableQuiz(String(args.quizId))
			const question = quiz.questions[args.index]
			if (!question) throw new NotFoundError("That question doesn't exist.")
			return { index: args.index, question, msLeft: QUESTION_MS }
		},
	}),

	// A signed-out player's answer, judged. Nothing is stored.
	judgeWatchGuestAnswer: t.field({
		type: WatchAnsweredQuestionRef,
		errors: {
			types: [NotFoundError],
			directResult: true,
			union: { name: "JudgeWatchGuestAnswerResult" },
		},
		args: {
			quizId: t.arg.id({ required: true }),
			index: t.arg.int({ required: true }),
			choice: t.arg.int({ required: false }),
			ms: t.arg.int({ required: true }),
		},
		resolve: async (_root, args) => {
			const quiz = await playableQuiz(String(args.quizId))
			const question = quiz.questions[args.index]
			if (!question) throw new NotFoundError("That question doesn't exist.")
			const answer = guestWatchAnswer(
				question,
				args.choice ?? null,
				args.ms,
				new Date(),
			)
			return { index: args.index, question, ...answer }
		},
	}),
}))

// Runs `change` on the viewer's attempt under a row lock, after writing
// down any question that ran out. `change` returns the columns to update,
// or null to leave it; throwing from it changes nothing.
async function changeAttempt(
	userId: string,
	quiz: LoadedWatchQuiz,
	change: (
		state: ReturnType<typeof evaluateWatchAttempt>,
		now: Date,
	) => Partial<typeof watchQuizAttempts.$inferInsert> | null,
) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(watchQuizAttempts)
			.where(
				and(
					eq(watchQuizAttempts.quizId, quiz.id),
					eq(watchQuizAttempts.userId, userId),
				),
			)
			.for("update")
		if (!row) throw new NotFoundError("Start the quiz first.")
		const now = new Date()
		const state = evaluateWatchAttempt(row, quiz.questions.length, now, {
			live: true,
		})
		const values = {
			...attemptValues(row, state, now),
			...(change(state, now) ?? {}),
		}
		const [saved] = await tx
			.update(watchQuizAttempts)
			.set(values)
			.where(eq(watchQuizAttempts.id, row.id))
			.returning()
		return watchPlayView(quiz, saved ?? row, { live: true, now })
	})
}

builder.mutationFields((t) => ({
	// Starts the viewer's run and puts the first question on the clock.
	// Pressing it again changes nothing.
	startWatchQuiz: t.field({
		type: WatchPlayRef,
		errors: playErrors("StartWatchQuizResult"),
		args: { quizId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const quiz = await playableQuiz(String(args.quizId))
			await db
				.insert(watchQuizAttempts)
				.values({ quizId: quiz.id, userId: user.id, openServedAt: new Date() })
				.onConflictDoNothing()
			return changeAttempt(user.id, quiz, () => null)
		},
	}),

	// Puts the next question on the clock. While one is already up, it's
	// that one, with the time it's had, so reloading doesn't reset it.
	nextWatchQuestion: t.field({
		type: WatchPlayRef,
		errors: playErrors("NextWatchQuestionResult"),
		args: { quizId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const quiz = await playableQuiz(String(args.quizId))
			return changeAttempt(user.id, quiz, (state, now) =>
				state.status === "between" ? { openServedAt: now } : null,
			)
		},
	}),

	// Answers the question on the clock. A null choice is the clock running
	// out on the player's screen. An answer to a question that already
	// closed just returns the run as it stands.
	answerWatchQuestion: t.field({
		type: WatchPlayRef,
		errors: playErrors("AnswerWatchQuestionResult"),
		args: {
			quizId: t.arg.id({ required: true }),
			index: t.arg.int({ required: true }),
			choice: t.arg.int({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const quiz = await playableQuiz(String(args.quizId))
			return changeAttempt(user.id, quiz, (state, now) => {
				if (args.index < state.answers.length) return null
				const judged = judgeWatchAnswer(
					quiz.questions,
					state,
					args.index,
					args.choice ?? null,
					now,
				)
				if (judged === "wrong_index") return null
				if (typeof judged === "string") {
					throw ValidationError.field("choice", REFUSAL_MESSAGES[judged])
				}
				const answers = [...state.answers, judged]
				return {
					answers,
					openServedAt: null,
					...tallyWatchAnswers(answers),
					finishedAt: answers.length >= state.total ? now : null,
				}
			})
		},
	}),

	// The viewer left the page while a question was up. Their result loses
	// its Clean run tag.
	reportWatchHidden: t.boolean({
		args: { quizId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			if (!ctx.user || !isUuid(String(args.quizId))) return false
			const updated = await db
				.update(watchQuizAttempts)
				.set({ clean: false })
				.where(
					and(
						eq(watchQuizAttempts.quizId, String(args.quizId)),
						eq(watchQuizAttempts.userId, ctx.user.id),
						isNull(watchQuizAttempts.finishedAt),
					),
				)
				.returning({ id: watchQuizAttempts.id })
			return updated.length > 0
		},
	}),

	// Saves the run a player made before they had an account. Only on a
	// live quiz, and only if the account hasn't played it: an account that
	// already did keeps its own.
	importWatchQuizAnswers: t.field({
		type: WatchPlayRef,
		errors: playErrors("ImportWatchQuizAnswersResult"),
		args: {
			quizId: t.arg.id({ required: true }),
			answers: t.arg({ type: [WatchGuestAnswerRef], required: true }),
			clean: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const quiz = await playableQuiz(String(args.quizId))
			const now = new Date()
			const answers = args.answers
				.slice(0, quiz.questions.length)
				.flatMap((a, i) => {
					const question = quiz.questions[i]
					return question
						? [guestWatchAnswer(question, a.choice ?? null, a.ms, now)]
						: []
				})
			await db
				.insert(watchQuizAttempts)
				.values({
					quizId: quiz.id,
					userId: user.id,
					answers,
					...tallyWatchAnswers(answers),
					clean: args.clean,
					finishedAt: answers.length >= quiz.questions.length ? now : null,
				})
				.onConflictDoNothing()
			return changeAttempt(user.id, quiz, () => null)
		},
	}),
}))
