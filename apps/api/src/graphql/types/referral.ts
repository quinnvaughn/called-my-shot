import { REDO_BALANCE_CAP } from "@called-my-shot/scoring"
import { db } from "../../db"
import type { User } from "../../db/schema"
import { findUserByReferralCode } from "../../lib/referrals"
import { builder } from "../builder"
import { UserRef } from "./user"

type ReferralPreviewShape = { inviter: User }

// What /join/:code shows before anyone has signed up, so the page can say who
// is inviting you rather than being a bare form. Public and unauthenticated
// by necessity - the whole point is that the visitor has no account yet.
//
// Deliberately thin: an inviter's name and nothing about their record. A code
// is a thing people paste into group chats, so whatever this returns is
// effectively public, and "who holds this code" is the only fact the page
// actually needs.
const ReferralPreviewRef = builder
	.objectRef<ReferralPreviewShape>("ReferralPreview")
	.implement({
		fields: (t) => ({
			inviter: t.field({
				type: UserRef,
				resolve: (preview) => preview.inviter,
			}),
			// So the page can state the offer without the number being written
			// into copy in two places.
			redoBalanceCap: t.field({
				type: "Int",
				resolve: () => REDO_BALANCE_CAP,
			}),
		}),
	})

builder.queryFields((t) => ({
	referralPreview: t.field({
		type: ReferralPreviewRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			const codeRow = await findUserByReferralCode(args.code)
			if (!codeRow) return null

			const inviter = await db.query.users.findFirst({
				where: { id: codeRow.userId },
			})
			if (!inviter) return null

			return { inviter }
		},
	}),
}))
