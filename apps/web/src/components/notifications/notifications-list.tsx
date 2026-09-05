import { useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { PageHeader } from "#/components/ui/page-header"
import { useGqlMutation } from "#/graphql/hooks"
import {
	MarkNotificationsReadDocument,
	notificationsQuery,
	unreadNotificationCountQuery,
} from "#/graphql/queries/notifications"
import { NotificationRow } from "./notification-row"

// How long to wait after a row is seen (see NotificationShell) before
// flushing the batch - lets several rows becoming visible in quick
// succession (initial load, scrolling) collapse into one mutation call.
const FLUSH_DELAY_MS = 1000

// Owns the seen-tracking alongside the list, not split across this and the
// route - marking read needs to update rows already on screen immediately,
// which means it has to live wherever `items` does. There's no "mark all
// read" action: a notification is read once it's actually been on screen
// (see NotificationShell), not on a manual click. The mutation's own response
// has no notification data to write back into the query cache (it just returns
// a boolean - see MarkNotificationsReadDocument), so a cache update can't do
// this for us; readIds below is that state instead.
export function NotificationsList() {
	const queryClient = useQueryClient()
	const [readIds, setReadIds] = useState<Set<string>>(new Set())
	const markRead = useGqlMutation(MarkNotificationsReadDocument, {
		// The badge in the app shell reads its own query, so nothing about
		// marking these read reaches it without a nudge.
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: unreadNotificationCountQuery.queryKey,
			}),
	})
	const markReadRef = useRef(markRead)
	markReadRef.current = markRead

	const pendingRef = useRef<Set<string>>(new Set())
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return () => {
			if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
			if (pendingRef.current.size > 0) {
				markReadRef.current.mutate({ ids: Array.from(pendingRef.current) })
			}
		}
	}, [])

	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(notificationsQuery())

	function markSeen(id: string) {
		if (readIds.has(id) || pendingRef.current.has(id)) return
		setReadIds((prev) => new Set(prev).add(id))
		pendingRef.current.add(id)
		if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
		flushTimerRef.current = setTimeout(() => {
			const ids = Array.from(pendingRef.current)
			pendingRef.current.clear()
			markRead.mutate({ ids })
		}, FLUSH_DELAY_MS)
	}

	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader title="Notifications" />
			<InfiniteScroll
				items={data.items}
				getKey={(item) => item.id}
				hasNextPage={hasNextPage}
				loading={isFetchingNextPage}
				onLoadMore={fetchNextPage}
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
