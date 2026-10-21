import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { ChainActivity } from "#/components/groups/group-chains/chain-activity"
import { ChainChat } from "#/components/groups/group-chains/chain-chat"
import { ChainHeaderActions } from "#/components/groups/group-chains/chain-header-actions"
import { chainHeadline } from "#/components/groups/group-chains/chain-headline"
import { ChainLinkList } from "#/components/groups/group-chains/chain-link-list"
import { ChainRequests } from "#/components/groups/group-chains/chain-requests"
import { ChainStakes } from "#/components/groups/group-chains/chain-stakes"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { CountBadge } from "#/components/ui/count-badge"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { ChainPageDocument } from "#/graphql/chains/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { formatShortDate } from "#/lib/format-date"
import { IN_PLAY_REFETCH_MS, isGameInPlay } from "#/lib/game-status"

// Polls while a link's game is on, so links light up as they land.
const chainQuery = (chainId: string) =>
	gqlQueryOptions(
		ChainPageDocument,
		{ chainId },
		{
			refetchInterval: (query) => {
				const chain = query.state.data?.chain
				const playing =
					chain?.phase === "LIVE" &&
					chain.links.some((link) => link.game && isGameInPlay(link.game))
				return playing ? IN_PLAY_REFETCH_MS : false
			},
		},
	)

// The chain itself, the group's chat about it, and what's happened to it.
// Kept apart so the chat isn't pushed below everything else.
const CHAIN_TABS = ["chain", "chat", "activity"] as const
type ChainTab = (typeof CHAIN_TABS)[number]

export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/chains/$chainId",
)({
	component: RouteComponent,
	validateSearch: z.object({
		tab: z.enum(CHAIN_TABS).optional().catch(undefined),
	}),
	staleTime: 0,
	loader: ({ context, params }) =>
		context.queryClient.query(chainQuery(params.chainId)),
})

function RouteComponent() {
	const { chainId } = Route.useParams()
	const tab: ChainTab = Route.useSearch().tab ?? "chain"
	const navigate = useNavigate({ from: Route.fullPath })
	const { data } = useSuspenseQuery(chainQuery(chainId))
	const chain = data.chain

	if (!chain?.group) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Chain"
				heading="This chain doesn't exist"
				subtitle="It may be in a group you're not in, or the link's just wrong."
				link={{ text: "View your groups", url: "/spaces" }}
			/>
		)
	}

	const viewerLink =
		chain.viewerLink?.status === "APPROVED" ||
		chain.viewerLink?.status === "REQUESTED"
			? chain.viewerLink.status
			: null
	const mine =
		viewerLink === "APPROVED"
			? (chain.links.find((link) => link.id === chain.viewerLink?.id) ?? null)
			: null
	const starter = chain.starter ? `Started by @${chain.starter.username}` : null
	const subtitle =
		chain.phase === "OPEN" && chain.locksAt
			? [starter, `Locks ${formatShortDate(chain.locksAt)}`]
					.filter(Boolean)
					.join(" · ")
			: starter

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link to="/spaces">Spaces</Breadcrumb.Link>
				<Breadcrumb.Link
					to="/groups/$groupId/chains"
					params={{ groupId: chain.group.id }}
				>
					{chain.group.name}
				</Breadcrumb.Link>
				<Breadcrumb.Current>Chain</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader
				title={chainHeadline(
					chain.phase,
					chain.links,
					chain.breaker?.user?.username ?? null,
				)}
				subtitle={subtitle}
				action={
					<ChainHeaderActions
						chainId={chain.id}
						phase={chain.phase}
						viewerIsStarter={chain.viewerIsStarter}
						viewerLinkStatus={viewerLink}
						canJoin={chain.viewerJoinBlockedReason === null}
						starterUsername={chain.starter?.username ?? null}
					/>
				}
			/>

			<Tabs<ChainTab>
				value={tab}
				onValueChange={(next) =>
					navigate({ search: { tab: next }, replace: true })
				}
			>
				<Tabs.List>
					<Tabs.Trigger value="chain">Chain</Tabs.Trigger>
					<Tabs.Trigger value="chat">
						Chat
						{chain.commentCount > 0 && (
							<CountBadge count={chain.commentCount} />
						)}
					</Tabs.Trigger>
					<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			{tab === "chat" ? (
				<ChainChat
					chainId={chain.id}
					canComment={chain.viewerCanComment}
					gifsEnabled={data.gifsEnabled}
				/>
			) : tab === "activity" ? (
				<ChainActivity events={chain.events} />
			) : (
				<VStack gap="8" alignItems="stretch">
					<ChainStakes
						phase={chain.phase}
						links={chain.links}
						mine={mine}
						joinMultiplier={chain.multiplierForNewLink}
						breakerUsername={chain.breaker?.user?.username ?? null}
					/>
					<ChainRequests requests={chain.pendingRequests} />
					<ChainLinkList links={chain.links} />
				</VStack>
			)}
		</VStack>
	)
}
