import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useLayoutEffect, useRef } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { ChatMessage } from "#/components/comments/chat-message"
import { CommentComposer } from "#/components/comments/comment-composer"
import {
	chainErrorMessage,
	invalidateChain,
	SendChainCommentDocument,
} from "#/graphql/chains/mutations"
import { ChainCommentsDocument } from "#/graphql/chains/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlInfiniteQueryOptions } from "#/graphql/query-options"
import { useFillHeight } from "#/hooks/use-fill-height"

// How often a chat open on screen checks for new messages.
const CHAT_POLL_MS = 10_000
const PAGE_SIZE = 30
// Within this many pixels of an edge counts as being at it.
const EDGE_PX = 120

const EMPTY = {
	items: [],
	pageInfo: { hasNextPage: false, endCursor: null },
}

type Props = {
	chainId: string
	canComment: boolean
	gifsEnabled: boolean
}

// The chain's chat: a panel filling the rest of the screen, newest message
// at the bottom right above the bar. It opens scrolled to the latest, loads
// older messages as it's scrolled up without jumping, and follows new ones
// in while the reader is at the bottom.
export function ChainChat({ chainId, canComment, gifsEnabled }: Props) {
	const queryClient = useQueryClient()
	const send = useGqlMutation(SendChainCommentDocument)
	const panel = useRef<HTMLDivElement>(null)
	const scroller = useRef<HTMLDivElement>(null)
	const height = useFillHeight(panel)
	// Whether the reader is at the bottom, so a new message should pull the
	// view down with it. Starts true: the chat opens on the latest.
	const atBottom = useRef(true)
	// The scroll height before an older page was asked for, to hold the view
	// still once it lands above.
	const heightBeforeOlder = useRef<number | null>(null)

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
		useInfiniteQuery(
			gqlInfiniteQueryOptions(
				ChainCommentsDocument,
				{ chainId, first: PAGE_SIZE },
				(result) => result.chain?.comments ?? EMPTY,
				{ refetchInterval: CHAT_POLL_MS },
			),
		)
	const messages = [...(data?.items ?? [])].reverse()
	const newestId = messages.at(-1)?.id

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the list changes
	useLayoutEffect(() => {
		const el = scroller.current
		if (!el) return
		if (heightBeforeOlder.current !== null) {
			el.scrollTop += el.scrollHeight - heightBeforeOlder.current
			heightBeforeOlder.current = null
			return
		}
		if (atBottom.current) el.scrollTop = el.scrollHeight
	}, [messages.length, newestId, height])

	function onScroll() {
		const el = scroller.current
		if (!el) return
		atBottom.current =
			el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_PX
		if (el.scrollTop < EDGE_PX && hasNextPage && !isFetchingNextPage) {
			heightBeforeOlder.current = el.scrollHeight
			void fetchNextPage()
		}
	}

	return (
		<VStack
			ref={panel}
			gap="3"
			alignItems="stretch"
			style={height ? { height } : undefined}
		>
			<div
				ref={scroller}
				onScroll={onScroll}
				className={css({
					flex: "1",
					minHeight: "0",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
				})}
			>
				{/* Pushes a short chat down against the bar, the way a chat
				    starts at the bottom. */}
				<div className={css({ marginTop: "auto" })} />
				{isFetchingNextPage && (
					<p
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
							textAlign: "center",
							paddingBlock: "2",
						})}
					>
						Loading older messages
					</p>
				)}
				{!isPending && messages.length === 0 && (
					<p
						className={css({
							fontSize: "sm",
							color: "fg.muted",
							paddingInline: "2",
							paddingBlock: "3",
						})}
					>
						Nobody's said anything yet.
					</p>
				)}
				{messages.map((message) => (
					<ChatMessage key={message.id} message={message} />
				))}
			</div>
			{canComment && (
				<CommentComposer
					gifsEnabled={gifsEnabled}
					placeholder="Message the chain"
					pending={send.isPending}
					onSubmit={async (draft) => {
						const result = (
							await send.mutateAsync({ input: { chainId, ...draft } })
						)?.sendChainComment
						if (result?.__typename === "ChainCommentPayload") {
							atBottom.current = true
							await invalidateChain(queryClient)
							return null
						}
						return chainErrorMessage(result)
					}}
				/>
			)}
		</VStack>
	)
}
