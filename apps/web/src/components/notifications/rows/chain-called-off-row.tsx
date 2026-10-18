import { FiLink } from "react-icons/fi"
import { chainTarget } from "#/components/notifications/chain-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChainCalledOffRowFragment = graphql(`
	fragment ChainCalledOffRow_notification on ChainCalledOffNotification {
		id
		createdAt
		groupName
		actorUsername
		chain {
			id
			group {
				id
			}
		}
	}
`)

// A chain the viewer was in was called off - see callOffChain.
export function ChainCalledOffRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChainCalledOffRowFragment>>) {
	const n = useFragment(ChainCalledOffRowFragment, notification)
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
				<b>@{n.actorUsername}</b> called off the chain in {n.groupName}
			</p>
		</NotificationShell>
	)
}
