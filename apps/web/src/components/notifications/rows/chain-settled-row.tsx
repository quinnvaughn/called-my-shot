import { FiLink } from "react-icons/fi"
import { match } from "ts-pattern"
import { chainTarget } from "#/components/notifications/chain-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChainSettledRowFragment = graphql(`
	fragment ChainSettledRow_notification on ChainSettledNotification {
		id
		createdAt
		groupName
		chain {
			id
			phase
			group {
				id
			}
			breaker {
				id
				user {
					id
					username
				}
			}
		}
	}
`)

// A chain the viewer is in held or broke - see recomputeChain. Read live, so
// it follows an overturn.
export function ChainSettledRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChainSettledRowFragment>>) {
	const n = useFragment(ChainSettledRowFragment, notification)
	const me = useMe()
	const breaker = n.chain?.breaker?.user
	const body = match(n.chain?.phase)
		.with("HELD", () => <>Your chain in {n.groupName} held</>)
		.with("BROKEN", () =>
			breaker?.id === me?.id ? (
				<>You broke the chain in {n.groupName}</>
			) : (
				<>
					<b>@{breaker?.username ?? "someone"}</b> broke your chain in{" "}
					{n.groupName}
				</>
			),
		)
		.otherwise(() => <>Your chain in {n.groupName} changed</>)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiLink}
			target={chainTarget(n.chain)}
			onOpen={onOpen}
		>
			<p className={text}>{body}</p>
		</NotificationShell>
	)
}
