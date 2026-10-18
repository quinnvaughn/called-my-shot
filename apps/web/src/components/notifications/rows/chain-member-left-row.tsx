import { FiLink } from "react-icons/fi"
import { chainTarget } from "#/components/notifications/chain-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChainMemberLeftRowFragment = graphql(`
	fragment ChainMemberLeftRow_notification on ChainMemberLeftNotification {
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

// Someone left a chain the viewer is in - see leaveChain.
export function ChainMemberLeftRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChainMemberLeftRowFragment>>) {
	const n = useFragment(ChainMemberLeftRowFragment, notification)
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
				<b>@{n.actorUsername}</b> left your chain in {n.groupName}
			</p>
		</NotificationShell>
	)
}
