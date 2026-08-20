import { useApolloClient, useMutation } from "@apollo/client/react"
import { useEffect, useRef, useState } from "react"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { PageHeader } from "#/components/ui/page-header"
import {
	MarkNotificationsReadDocument,
	NotificationsPageDocument,
	UnreadNotificationCountDocument,
} from "#/graphql/queries/notifications"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"
import { type NotificationItem, NotificationRow } from "./notification-row"

type Props = {
	initialItems: NotificationItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// How long to wait after a row is seen (see NotificationShell) before
// flushing the batch - lets several rows becoming visible in quick
// succession (initial load, scrolling) collapse into one mutation call.
const FLUSH_DELAY_MS = 1000

// Owns the seen-tracking alongside the list, not split across this and the
// route - marking read needs to update rows already on screen immediately,
// which means it has to live wherever `items` does. There's no "mark all
// read" action: a notification is read once it's actually been on screen
// (see NotificationShell), not on a manual click. The mutation's own response
// has no notification data to normalize into Apollo's cache (it just returns
// a boolean - see MarkNotificationsReadDocument), so cache writes can't do
// this for us; readIds below is that state instead.
export function NotificationsList({ initialItems, initialPageInfo }: Props) {
	const client = useApolloClient()
	const [readIds, setReadIds] = useState<Set<string>>(new Set())
	const [markRead] = useMutation(MarkNotificationsReadDocument, {
		refetchQueries: [{ query: UnreadNotificationCountDocument }],
	})
	const markReadRef = useRef(markRead)
	markReadRef.current = markRead

	const pendingRef = useRef<Set<string>>(new Set())
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return () => {
			if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
			if (pendingRef.current.size > 0) {
				markReadRef.current({
					variables: { ids: Array.from(pendingRef.current) },
				})
			}
		}
	}, [])

	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<NotificationItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: NotificationsPageDocument,
					variables: { after },
				})
				return data?.notifications.__typename === "QueryNotificationsSuccess"
					? data.notifications.data
					: { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
			},
		)

	function markSeen(id: string) {
		if (readIds.has(id) || pendingRef.current.has(id)) return
		setReadIds((prev) => new Set(prev).add(id))
		pendingRef.current.add(id)
		if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
		flushTimerRef.current = setTimeout(() => {
			const ids = Array.from(pendingRef.current)
			pendingRef.current.clear()
			markRead({ variables: { ids } })
		}, FLUSH_DELAY_MS)
	}

	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader title="Notifications" />
			<InfiniteScroll
				items={items}
				getKey={(item) => item.id}
				hasNextPage={hasNextPage}
				loading={loading}
				onLoadMore={loadMore}
				emptyState={<EmptyState>No notifications yet.</EmptyState>}
				renderItem={(item) => (
					<NotificationRow
						notification={item}
						unread={item.readAt === null && !readIds.has(item.id)}
						onOpen={markSeen}
					/>
				)}
			/>
		</VStack>
	)
}
