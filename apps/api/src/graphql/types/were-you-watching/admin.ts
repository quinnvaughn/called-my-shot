import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import type { WatchQuestion } from "../../../db/schema"
import { games, watchQuizAttempts } from "../../../db/schema"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { isUuid } from "../../../lib/uuid"
import { buildWatchQuiz } from "../../../lib/were-you-watching/generate"
import {
	findWatchQuiz,
	type LoadedWatchQuiz,
} from "../../../lib/were-you-watching/load"
import { builder } from "../../builder"
import { WatchQuizRef } from "./refs"

const adminErrors = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
]

const WatchAdminQuestionRef = builder
	.objectRef<WatchQuestion>("WatchAdminQuestion")
	.implement({
		fields: (t) => ({
			template: t.exposeString("template"),
			prompt: t.exposeString("prompt"),
			options: t.stringList({ resolve: (q) => q.options.map((o) => o.label) }),
			answer: t.exposeInt("answer"),
			reveal: t.exposeString("reveal"),
		}),
	})

// A quiz with its answers, for checking what it asks.
const WatchQuizAdminRef = builder
	.objectRef<LoadedWatchQuiz>("WatchQuizAdmin")
	.implement({
		fields: (t) => ({
			quiz: t.field({ type: WatchQuizRef, resolve: (q) => q }),
			questions: t.field({
				type: [WatchAdminQuestionRef],
				resolve: (q) => q.questions,
			}),
			started: t.int({
				resolve: (q) =>
					db.$count(watchQuizAttempts, eq(watchQuizAttempts.quizId, q.id)),
			}),
		}),
	})

async function quizById(raw: string | number): Promise<LoadedWatchQuiz> {
	const id = String(raw)
	const quiz = isUuid(id) ? await findWatchQuiz(id) : null
	if (!quiz) throw new NotFoundError("That quiz doesn't exist.")
	return quiz
}

builder.queryFields((t) => ({
	adminWatchQuiz: t.field({
		type: WatchQuizAdminRef,
		errors: {
			types: adminErrors,
			directResult: true,
			union: { name: "AdminWatchQuizResult" },
		},
		args: { quizId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			return quizById(args.quizId)
		},
	}),
}))

builder.mutationFields((t) => ({
	// Builds the quiz again from the game's box score as it stands. A quiz
	// someone has started is only rebuilt with `force`, which wipes their
	// runs.
	rebuildWatchQuiz: t.field({
		type: WatchQuizAdminRef,
		errors: {
			types: adminErrors,
			directResult: true,
			union: { name: "RebuildWatchQuizResult" },
		},
		args: {
			quizId: t.arg.id({ required: true }),
			force: t.arg.boolean({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const quiz = await quizById(args.quizId)
			if (args.force) {
				await db
					.delete(watchQuizAttempts)
					.where(eq(watchQuizAttempts.quizId, quiz.id))
			}
			const [game] = await db
				.select()
				.from(games)
				.where(eq(games.id, quiz.gameId))
			if (!game) throw new NotFoundError("That quiz's game is gone.")
			const outcome = await buildWatchQuiz(game, quiz.teamId)
			if (outcome === "kept") {
				throw ValidationError.field(
					"force",
					"Someone has started this quiz. Rebuild with force to wipe their runs.",
				)
			}
			if (outcome === "skipped") {
				throw ValidationError.field(
					"quizId",
					"The box score can't fill a quiz anymore.",
				)
			}
			return quizById(quiz.id)
		},
	}),

	resetMyWatchPlay: t.field({
		type: WatchQuizRef,
		errors: {
			types: adminErrors,
			directResult: true,
			union: { name: "ResetMyWatchPlayResult" },
		},
		args: { quizId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireAdmin(ctx)
			const quiz = await quizById(args.quizId)
			await db
				.delete(watchQuizAttempts)
				.where(
					and(
						eq(watchQuizAttempts.quizId, quiz.id),
						eq(watchQuizAttempts.userId, user.id),
					),
				)
			return quiz
		},
	}),
}))
