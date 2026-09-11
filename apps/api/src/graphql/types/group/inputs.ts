import type { Group, QuestionShare } from "../../../db/schema"
import { builder } from "../../builder"
import { GroupRef, QuestionShareRef } from "./refs"

export const GroupPayload = builder
	.objectRef<{ group: Group }>("GroupPayload")
	.implement({
		fields: (t) => ({
			group: t.field({ type: GroupRef, resolve: (payload) => payload.group }),
		}),
	})

export const QuestionSharePayload = builder
	.objectRef<{ share: QuestionShare }>("QuestionSharePayload")
	.implement({
		fields: (t) => ({
			share: t.field({
				type: QuestionShareRef,
				resolve: (payload) => payload.share,
			}),
		}),
	})

export const CreateGroupInput = builder.inputType("CreateGroupInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		description: t.string({ required: false }),
		// omitted or empty tracks every league
		leagueIds: t.idList({ required: false }),
	}),
})

export const UpdateGroupInput = builder.inputType("UpdateGroupInput", {
	fields: (t) => ({
		groupId: t.id({ required: true }),
		name: t.string({ required: true }),
		// blank clears it
		description: t.string({ required: true }),
		// empty tracks every league
		leagueIds: t.idList({ required: true }),
	}),
})

export const JoinGroupInput = builder.inputType("JoinGroupInput", {
	fields: (t) => ({
		code: t.string({ required: true }),
	}),
})
