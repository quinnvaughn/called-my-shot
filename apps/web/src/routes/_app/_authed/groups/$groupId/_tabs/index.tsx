import { useSuspenseQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	redirect,
	useRouteContext,
} from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	AnsweredQuestionsTab,
	answeredQuestionsQuery,
} from "#/components/groups/answered-questions-tab"
import {
	CreatedQuestionsTab,
	createdQuestionsQuery,
} from "#/components/groups/created-questions-tab"
import { GroupBallotsStrip } from "#/components/groups/group-ballots-strip"
import { GroupChallengeStrip } from "#/components/groups/group-challenge-strip"
import {
	GroupGamesStrip,
	groupLiveGamesQuery,
} from "#/components/groups/group-games-strip"
import { GroupPinnedStrip } from "#/components/groups/group-pinned-strip"
import { GroupPresserStrip } from "#/components/groups/group-presser-strip"
import { GroupRecapCard } from "#/components/groups/group-recap-card"
import {
	SharedQuestionsTab,
	sharedQuestionsQuery,
} from "#/components/groups/shared-questions-tab"
import { Tabs } from "#/components/ui/tabs"
import { GroupHomeDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions, seedInfiniteQuery } from "#/graphql/query-options"
import { validateLeaderboardSearch } from "#/lib/leaderboard-filter"
import { groupShellQuery } from "../_tabs"

const groupHomeQuery = (groupId: string) =>
	gqlQueryOptions(GroupHomeDocument, { groupId })

// What's happening in the group right now: pins, games on or about to be,
// fresh presser answers, ballots, this week's recap, then the activity feed.
// Every strip renders nothing when it has nothing current, so a quiet week
// makes a shorter page rather than a row of empty boxes.
export const Route = createFileRoute("/_app/_authed/groups/$groupId/_tabs/")({
	component: RouteComponent,
	// The leaderboard lived on this page before it had a tab, so a link shared
	// back then carries its filter here. Sent on to the tab with the filter
	// intact.
	validateSearch: validateLeaderboardSearch,
	beforeLoad: ({ params, search }) => {
		if (search.league || search.season) {
			throw redirect({
				to: "/groups/$groupId/leaderboard",
				params,
				search,
			})
		}
	},
	// Each activity tab gets its first page as an aliased field of one query
	// (see GroupHomeDocument), handed to the infinite caches the lists
	// paginate with rather than costing a request each.
	loader: async ({ context, params }) => {
		const { groupId } = params
		const data = await context.queryClient.query(groupHomeQuery(groupId))
		const group = data.group
		if (!group) return

		context.queryClient.setQueryData(groupLiveGamesQuery(groupId).queryKey, {
			group: { id: group.id, liveGames: group.liveGames },
		})
		seedInfiniteQuery(context.queryClient, answeredQuestionsQuery(groupId), {
			group: { id: group.id, answeredQuestions: group.answeredQuestions },
		})
		seedInfiniteQuery(context.queryClient, createdQuestionsQuery(groupId), {
			group: { id: group.id, createdQuestions: group.createdQuestions },
		})
		seedInfiniteQuery(context.queryClient, sharedQuestionsQuery(groupId), {
			group: { id: group.id, sharedQuestions: group.sharedQuestions },
		})
	},
})

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"answered" | "created" | "shared">(
		"answered",
	)
	const { groupId } = Route.useParams()
	const { me } = useRouteContext({ from: "__root__" })
	const { data } = useSuspenseQuery(groupHomeQuery(groupId))
	const { data: shell } = useSuspenseQuery(groupShellQuery(groupId))
	const group = data.group
	// The layout already shows the not-found state for a missing group.
	if (!group || !shell.group) return null

	return (
		<VStack alignItems="stretch" gap="6">
			<GroupPinnedStrip
				groupId={group.id}
				pins={group.pins}
				viewerIsAdmin={group.viewerIsAdmin}
			/>
			<GroupGamesStrip groupId={group.id} />
			<GroupPresserStrip
				groupId={group.id}
				viewerId={me?.id ?? null}
				highlights={group.presserHighlights}
			/>
			<GroupChallengeStrip challenges={group.challengeHighlights} />
			<GroupBallotsStrip
				groupId={group.id}
				ballots={group.ballots}
				viewerIsAdmin={group.viewerIsAdmin}
			/>
			{group.currentRecap && (
				<GroupRecapCard
					recap={group.currentRecap}
					groupName={shell.group.name}
				/>
			)}
			<VStack alignItems="stretch" gap="3">
				<h2
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.muted",
						textTransform: "uppercase",
					})}
				>
					Activity
				</h2>
				<Tabs value={activeTab} onValueChange={setActiveTab}>
					<Tabs.List>
						<Tabs.Trigger value="answered">Answered</Tabs.Trigger>
						<Tabs.Trigger value="created">Created</Tabs.Trigger>
						<Tabs.Trigger value="shared">Shared</Tabs.Trigger>
					</Tabs.List>
				</Tabs>
			</VStack>
			{match(activeTab)
				.with("answered", () => <AnsweredQuestionsTab groupId={group.id} />)
				.with("created", () => <CreatedQuestionsTab groupId={group.id} />)
				.with("shared", () => <SharedQuestionsTab groupId={group.id} />)
				.exhaustive()}
		</VStack>
	)
}
