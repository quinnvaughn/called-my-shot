import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import { userFlairs, users } from "../../../db/schema"
import { requireAdmin, requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { canEquip } from "../../../lib/flairs/available"
import { builder } from "../../builder"
import { UserRef } from "../user"

builder.mutationFields((t) => ({
	// Every mutation here returns the user so the client can re-read
	// equippedFlair straight off the result instead of refetching Me.
	equipFlair: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "EquipFlairResult" },
		},
		args: { flairId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const flair = await db.query.flairs.findFirst({
				where: { id: String(args.flairId) },
			})
			if (!flair) throw new NotFoundError("Flair not found")

			// The client only ever offers what myFlairs returned, so this is the
			// check that actually holds: a retired flair, someone else's grant,
			// or a group's private flair all land here.
			if (!(await canEquip(user.id, flair))) {
				throw ValidationError.field(
					"flairId",
					"You haven't unlocked that flair.",
				)
			}

			const [updated] = await db
				.update(users)
				.set({ equippedFlairId: flair.id })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new NotFoundError("User not found")
			return updated
		},
	}),

	unequipFlair: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "UnequipFlairResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			const [updated] = await db
				.update(users)
				.set({ equippedFlairId: null })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new NotFoundError("User not found")
			return updated
		},
	}),

	grantFlair: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "GrantFlairResult" },
		},
		args: {
			userId: t.arg.id({ required: true }),
			flairId: t.arg.id({ required: true }),
			note: t.arg.string({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const flair = await db.query.flairs.findFirst({
				where: { id: String(args.flairId) },
				columns: { id: true, unlock: true },
			})
			if (!flair) throw new NotFoundError("Flair not found")
			// An "open" flair is equippable by everyone already, so a grant row
			// for one would be a row that grants nothing and confuses the next
			// person to read the table.
			if (flair.unlock === "open") {
				throw ValidationError.field(
					"flairId",
					"That flair is already available to everyone.",
				)
			}

			const target = await db.query.users.findFirst({
				where: { id: String(args.userId) },
			})
			if (!target) throw new NotFoundError("User not found")

			await db
				.insert(userFlairs)
				.values({
					userId: target.id,
					flairId: flair.id,
					grantedByUserId: admin.id,
					note: args.note ?? null,
				})
				// Granting twice is the admin confirming what's already true, not
				// an error worth showing them.
				.onConflictDoNothing()

			return target
		},
	}),

	revokeFlair: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "RevokeFlairResult" },
		},
		args: {
			userId: t.arg.id({ required: true }),
			flairId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const userId = String(args.userId)
			const flairId = String(args.flairId)

			return db.transaction(async (tx) => {
				await tx
					.delete(userFlairs)
					.where(
						and(eq(userFlairs.userId, userId), eq(userFlairs.flairId, flairId)),
					)

				// Taking the grant away has to take the chip off too, or they
				// keep wearing something they no longer hold. Same transaction,
				// so the two can't disagree.
				const [updated] = await tx
					.update(users)
					.set({ equippedFlairId: null })
					.where(and(eq(users.id, userId), eq(users.equippedFlairId, flairId)))
					.returning()
				if (updated) return updated

				const target = await tx.query.users.findFirst({
					where: { id: userId },
				})
				if (!target) throw new NotFoundError("User not found")
				return target
			})
		},
	}),
}))
