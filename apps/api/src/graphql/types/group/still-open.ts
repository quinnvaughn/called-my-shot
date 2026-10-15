import { requireUser } from "../../../lib/auth"
import { leagueScope } from "../../../lib/group-leaderboard"
import {
	loadStillOpen,
	type StillOpenQuestion,
} from "../../../lib/group-still-open"
import { builder } from "../../builder"
import { QuestionRef } from "../question"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"
import { GroupRef } from "./refs"

type StillOpenPick = StillOpenQuestion["picks"][number]

const StillOpenPickRef = builder
	.objectRef<StillOpenPick>("GroupStillOpenPick")
	.implement({
		fields: (t) => ({
			optionId: t.exposeID("optionId"),
			// Members who took this option.
			count: t.exposeInt("count"),
		}),
	})

const StillOpenQuestionRef = builder
	.objectRef<StillOpenQuestion>("GroupStillOpenQuestion")
	.implement({
		fields: (t) => ({
			question: t.field({ type: QuestionRef, resolve: (e) => e.question }),
			memberCount: t.exposeInt("memberCount"),
			// Most picked first.
			picks: t.field({ type: [StillOpenPickRef], resolve: (e) => e.picks }),
			medianGuess: t.exposeFloat("medianGuess", { nullable: true }),
		}),
	})

builder.objectFields(GroupRef, (t) => ({
	// Questions in the group's tracked leagues locking in the next 48 hours
	// that the viewer hasn't called and at least two members have, soonest
	// lock first and the closest split first within a lock.
	stillOpenQuestions: t.field({
		type: [StillOpenQuestionRef],
		resolve: async (group, _args, ctx) => {
			const user = requireUser(ctx)
			const [memberIds, tracked] = await Promise.all([
				memberUserIds(ctx, group.id),
				trackedLeagueIds(ctx, group.id),
			])
			return loadStillOpen(user.id, memberIds, leagueScope(tracked, null))
		},
	}),
}))
