import { and, desc, eq } from "drizzle-orm"
import { db } from "../../../db"
import { presserQuestions, presserReports } from "../../../db/schema"
import { requireAdmin } from "../../../lib/auth"
import { blockedUsers } from "../../../lib/pressers/actions"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { GroupGameEntryRef } from "../group/game-board"
import { CallRef } from "../question/call"
import { GameEntryRef } from "../sports"
import { UserRef } from "../user"
import {
	presserByCallLoader,
	presserByUserGameLoader,
	presserKey,
} from "./loaders"
import { PresserQuestionRef, PresserRef, PresserReportRef } from "./refs"

builder.queryFields((t) => ({
	presser: t.field({
		type: PresserRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			const id = String(args.id)
			if (!isUuid(id)) return null
			const presser = await db.query.pressers.findFirst({ where: { id } })
			return presser ?? null
		},
	}),

	// The people the viewer has blocked, for settings. Empty signed out.
	blockedUsers: t.field({
		type: [UserRef],
		resolve: (_root, _args, ctx) => (ctx.user ? blockedUsers(ctx.user.id) : []),
	}),

	// Open reports on presser content, oldest first.
	adminPresserReports: t.field({
		type: [PresserReportRef],
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return db
				.select()
				.from(presserReports)
				.where(eq(presserReports.status, "open"))
				.orderBy(presserReports.createdAt)
		},
	}),
}))

builder.objectFields(GameEntryRef, (t) => ({
	// The entry's owner's presser on the game. Null until it opens.
	presser: t.field({
		type: PresserRef,
		nullable: true,
		resolve: (entry, _args, ctx) =>
			presserByUserGameLoader(ctx).load(
				presserKey(entry.user.id, entry.gameId),
			),
	}),
}))

builder.objectFields(GroupGameEntryRef, (t) => ({
	presser: t.field({
		type: PresserRef,
		nullable: true,
		resolve: (entry, _args, ctx) =>
			presserByUserGameLoader(ctx).load(
				presserKey(entry.user.id, entry.gameId),
			),
	}),
}))

builder.objectFields(CallRef, (t) => ({
	// The presser covering this call: its caller's, on its game.
	presser: t.field({
		type: PresserRef,
		nullable: true,
		resolve: (call, _args, ctx) => presserByCallLoader(ctx).load(call.id),
	}),
	// The app's answered questions about this call, for its page.
	presserQuestions: t.field({
		type: [PresserQuestionRef],
		resolve: (call) =>
			db
				.select()
				.from(presserQuestions)
				.where(
					and(
						eq(presserQuestions.callId, call.id),
						eq(presserQuestions.status, "answered"),
					),
				)
				.orderBy(desc(presserQuestions.answeredAt)),
	}),
}))
