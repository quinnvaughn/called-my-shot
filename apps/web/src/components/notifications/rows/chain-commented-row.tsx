import { FiMessageCircle } from "react-icons/fi"
import { chainTarget } from "#/components/notifications/chain-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChainCommentedRowFragment = graphql(`
	fragment ChainCommentedRow_notification on ChainCommentedNotification {
		id
		createdAt
		groupName
		lastCommenterUsername
		chain {
			id
			group {
				id
			}
		}
	}
`)

// Someone posted in a chain the viewer is in - see sendChainComment.
export function ChainCommentedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChainCommentedRowFragment>>) {
	const n = useFragment(ChainCommentedRowFragment, notification)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiMessageCircle}
			target={chainTarget(n.chain, "chat")}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.lastCommenterUsername ?? "someone"}</b> posted in your chain in{" "}
				{n.groupName}
			</p>
		</NotificationShell>
	)
}
