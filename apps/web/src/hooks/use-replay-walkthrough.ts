import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidateOnboarding,
	RestartOnboardingDocument,
} from "#/graphql/onboarding/mutations"
import { onboardingQuery } from "#/graphql/onboarding/queries"
import { buildQuestionSlug } from "#/lib/slug"
import { endTour } from "#/stores/tour-store"

// Starts the walkthrough outright rather than clearing the dismissal and
// hoping the launcher comes back. It would not: the launcher also hides once
// the viewer has made a call, so routing this through it would do nothing at
// all for everyone past their first call - which is everyone who would ever
// want a second look at how scoring works.
//
// Clearing the timestamp still matters for the case where they have not
// called yet and dismissed the pill: it puts the standing offer back too.
export function useReplayWalkthrough() {
	const navigate = useNavigate()
	const router = useRouter()
	const queryClient = useQueryClient()
	const restartOnboarding = useGqlMutation(RestartOnboardingDocument)

	async function replay() {
		// A tour abandoned by navigating away leaves its step index behind, and
		// "replay" that resumes at step 3 is not a replay.
		endTour()
		await restartOnboarding.mutateAsync(undefined)
		await invalidateOnboarding(queryClient)
		await router.invalidate()

		// suggestedFirstQuestion skips anything this viewer already called, so a
		// replay lands on a question that is genuinely still callable and the
		// coachmarks have a live form to point at.
		const data = await queryClient.fetchQuery(onboardingQuery)
		const suggested =
			data.viewerOnboarding.__typename === "ViewerOnboarding"
				? data.viewerOnboarding.suggestedQuestion
				: null

		if (!suggested) {
			await navigate({ to: "/" })
			return
		}
		await navigate({
			to: "/questions/$questionId/{-$slug}",
			params: {
				questionId: suggested.id,
				slug: buildQuestionSlug(suggested.title),
			},
			search: { tour: "first-call" },
		})
	}

	return { replay, pending: restartOnboarding.isPending }
}
