import { FiLink } from "react-icons/fi"
import { chainTarget } from "#/components/notifications/chain-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChainLinkRequestedRowFragment = graphql(`
	fragment ChainLinkRequestedRow_notification on ChainLinkRequestedNotification {
		id
		createdAt
		groupName
		actorUsername
		pendingCount
		chain {
			id
			group {
				id
			}
		}
	}
`)

// Someone asked to add a link to the viewer's chain - see requestLink.
export function ChainLinkRequestedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChainLinkRequestedRowFragment>>) {
	const n = useFragment(ChainLinkRequestedRowFragment, notification)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiLink}
			target={chainTarget(n.chain)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b>
				{n.pendingCount > 1
					? ` and ${n.pendingCount - 1} ${n.pendingCount === 2 ? "other" : "others"} want`
					: " wants"}{" "}
				in on your chain in {n.groupName}
			</p>
		</NotificationShell>
	)
}
