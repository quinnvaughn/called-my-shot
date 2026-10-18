import { FiLink } from "react-icons/fi"
import { chainTarget } from "#/components/notifications/chain-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChainLinkDecidedRowFragment = graphql(`
	fragment ChainLinkDecidedRow_notification on ChainLinkDecidedNotification {
		id
		createdAt
		groupName
		actorUsername
		approved
		chain {
			id
			group {
				id
			}
		}
	}
`)

// The starter answered the viewer's request - see decideLink.
export function ChainLinkDecidedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChainLinkDecidedRowFragment>>) {
	const n = useFragment(ChainLinkDecidedRowFragment, notification)
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
				{n.approved === false
					? " turned down your link"
					: " added your link to the chain"}{" "}
				in {n.groupName}
			</p>
		</NotificationShell>
	)
}
