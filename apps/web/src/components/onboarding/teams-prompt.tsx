import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouteContext } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { useEffect, useRef } from "react"
import { FavoriteTeamsPickerModal } from "#/components/teams/favorite-teams-picker-modal"
import { useGqlMutation } from "#/graphql/hooks"
import { MarkTeamsPromptSeenDocument } from "#/graphql/mutations/favorite-teams"
import { MeDocument } from "#/graphql/queries/me"
import { ViewerOnboardingDocument } from "#/graphql/queries/onboarding"
import { gqlQueryOptions } from "#/graphql/query-options"
import { modalStore, openModal } from "#/stores/modal-store"

const onboardingQuery = gqlQueryOptions(ViewerOnboardingDocument, {})
const meQuery = gqlQueryOptions(MeDocument, {})

// How old an account has to be before the prompt can open. The visit you
// sign up on belongs to the first-call walkthrough, so this is what makes it
// a later visit instead.
const LATER_VISIT_MS = 12 * 60 * 60 * 1000

// Opens the favorite-teams picker once, ever, for an account that has come
// back without picking any. It's stamped seen the moment it opens, so closing
// it any way at all is final. The checklist's "Pick your teams" step is the
// standing reminder after that. Renders nothing itself.
export function TeamsPrompt() {
	const { me } = useRouteContext({ from: "__root__" })
	const queryClient = useQueryClient()
	const { mutate: markSeen } = useGqlMutation(MarkTeamsPromptSeenDocument)
	// Shares the checklist's cache entry, so this costs no request of its own.
	const { data } = useQuery({ ...onboardingQuery, enabled: !!me })
	// Never stacked on another modal, such as the one /home opens after
	// posting picks made before signing up.
	const modalOpen = useStore(modalStore, (stack) => stack.length > 0)
	const opened = useRef(false)

	const hasFavoriteTeams =
		data?.viewerOnboarding.__typename === "ViewerOnboarding"
			? data.viewerOnboarding.hasFavoriteTeams
			: null

	useEffect(() => {
		if (opened.current || modalOpen) return
		if (!me || me.teamsPromptSeenAt) return
		// null while loading: wait for the answer rather than guess.
		if (hasFavoriteTeams !== false) return
		if (Date.now() - Date.parse(me.createdAt) < LATER_VISIT_MS) return

		opened.current = true
		openModal(<FavoriteTeamsPickerModal initialTeamIds={[]} variant="prompt" />)
		// Refetching Me is what stops the next visit to /home in this session
		// from opening it again, since router context reads Me's cache.
		markSeen(undefined, {
			onSuccess: () =>
				queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
		})
	}, [me, hasFavoriteTeams, modalOpen, markSeen, queryClient])

	return null
}
