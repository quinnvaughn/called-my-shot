import { setFavoriteTeamsSchema } from "@called-my-shot/schemas"
import { eq, inArray, sql } from "drizzle-orm"
import { db } from "../../../db"
import { teams, userFavoriteTeams, users } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { AuthenticationError, NotFoundError } from "../../../lib/errors"
import { builder } from "../../builder"
import { parseInput } from "../../helpers"
import { UserRef } from "./refs"

builder.mutationFields((t) => ({
	// Replaces the whole list, in the order given. The picker edits a local
	// copy and saves once, so there is no add/remove pair to keep consistent
	// and the order is whatever the array says. An empty array clears it.
	setFavoriteTeams: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "SetFavoriteTeamsResult" },
		},
		args: { teamIds: t.arg.idList({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { teamIds } = parseInput(setFavoriteTeamsSchema, {
				teamIds: args.teamIds.map(String),
			})

			if (teamIds.length > 0) {
				const found = await db
					.select({ id: teams.id })
					.from(teams)
					.where(inArray(teams.id, teamIds))
				if (found.length !== teamIds.length) {
					throw new NotFoundError("Team not found")
				}
			}

			await db.transaction(async (tx) => {
				await tx
					.delete(userFavoriteTeams)
					.where(eq(userFavoriteTeams.userId, user.id))
				if (teamIds.length > 0) {
					await tx.insert(userFavoriteTeams).values(
						teamIds.map((teamId, position) => ({
							userId: user.id,
							teamId,
							position,
						})),
					)
				}
			})
			return user
		},
	}),

	// Stamped by the /home prompt as it opens, not when it closes, so a
	// reload or a navigation away can't bring it back. coalesce keeps the
	// first time.
	markTeamsPromptSeen: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "MarkTeamsPromptSeenResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			const [updated] = await db
				.update(users)
				.set({
					teamsPromptSeenAt: sql`coalesce(${users.teamsPromptSeenAt}, now())`,
				})
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new Error(`user ${user.id} vanished mid-request`)
			return updated
		},
	}),
}))
