import { eq } from "drizzle-orm"
import { db } from "../../../db"
import {
	calls,
	groupMembers,
	type Question,
	questions,
	users,
} from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { AuthenticationError } from "../../../lib/errors"
import { suggestedFirstQuestion } from "../../../lib/onboarding"
import { builder } from "../../builder"
import { QuestionRef } from "../question"

// What the walkthrough needs: the launcher to decide whether to offer itself,
// and the get-started checklist to decide which of its steps are already done.
//
// Almost every one of these is derived from the user's actual rows rather than
// a stored progress flag: nothing to keep in sync, nothing to backfill, and a
// step can't get stuck showing as outstanding for someone who already did it.
// It also means an existing user who has been calling for months opens the
// checklist already mostly ticked instead of being told to start over. The one
// exception is hasViewedLeaderboard, read off users.leaderboardViewedAt,
// because opening a page leaves no other row behind.
type ViewerOnboarding = {
	userId: string
	hasCalled: boolean
	hasViewedLeaderboard: boolean
	hasGroup: boolean
	hasCreatedQuestion: boolean
}

const ViewerOnboardingRef = builder
	.objectRef<ViewerOnboarding>("ViewerOnboarding")
	.implement({
		fields: (t) => ({
			hasCalled: t.exposeBoolean("hasCalled"),
			// Stamped by markLeaderboardViewed the first time a signed-in user
			// opens the leaderboard.
			hasViewedLeaderboard: t.exposeBoolean("hasViewedLeaderboard"),
			// True for anyone in a group by any route, including someone who
			// joined through an invite link rather than starting one. Being in
			// somebody else's group is the same outcome the step is asking for.
			hasGroup: t.exposeBoolean("hasGroup"),
			hasCreatedQuestion: t.exposeBoolean("hasCreatedQuestion"),
			// The question to put in front of someone who has never called.
			// Null only when nothing at all is open - see lib/onboarding.ts for
			// the fallback ladder that keeps this populated in the offseason.
			suggestedQuestion: t.field({
				type: QuestionRef,
				nullable: true,
				resolve: (onboarding): Promise<Question | null> =>
					suggestedFirstQuestion(onboarding.userId),
			}),
		}),
	})

builder.queryFields((t) => ({
	viewerOnboarding: t.field({
		type: ViewerOnboardingRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "ViewerOnboardingResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)

			// Four lookups, run together since none depends on the others.
			// hasCalled is deliberately not User.careerStats: that builds the
			// entire global leaderboard to answer a single EXISTS. The leaderboard
			// visit is read fresh rather than off ctx's user, which can predate a
			// markLeaderboardViewed made earlier in the same session.
			const [called, grouped, authored, viewer] = await Promise.all([
				db
					.select({ id: calls.id })
					.from(calls)
					.where(eq(calls.userId, user.id))
					.limit(1),
				db
					.select({ id: groupMembers.id })
					.from(groupMembers)
					.where(eq(groupMembers.userId, user.id))
					.limit(1),
				db
					.select({ id: questions.id })
					.from(questions)
					.where(eq(questions.creatorId, user.id))
					.limit(1),
				db
					.select({ leaderboardViewedAt: users.leaderboardViewedAt })
					.from(users)
					.where(eq(users.id, user.id))
					.limit(1),
			])

			return {
				userId: user.id,
				hasCalled: called.length > 0,
				hasViewedLeaderboard: viewer[0]?.leaderboardViewedAt != null,
				hasGroup: grouped.length > 0,
				hasCreatedQuestion: authored.length > 0,
			}
		},
	}),
}))
