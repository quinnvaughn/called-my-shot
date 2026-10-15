import { FiFlag } from "react-icons/fi"
import { challengeTarget } from "#/components/notifications/challenge-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChallengeGloatedRowFragment = graphql(`
	fragment ChallengeGloatedRow_notification on ChallengeGloatedNotification {
		id
		createdAt
		actorUsername
		challenge {
			id
			code
			creator {
				id
				username
			}
		}
	}
`)

// Someone who beat the viewer in a challenge gloated - see sendChallengeGloat.
export function ChallengeGloatedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengeGloatedRowFragment>>) {
	const n = useFragment(ChallengeGloatedRowFragment, notification)
	const me = useMe()
	const c = n.challenge
	// The 1v1 between the viewer and whoever talked trash, named by its
	// acceptor: the viewer when the creator sent it, the sender otherwise.
	const acceptor =
		c && n.actorUsername === c.creator.username ? me?.username : n.actorUsername
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={
				c && acceptor
					? {
							to: "/challenges/$code/vs/$username",
							params: { code: c.code, username: acceptor },
							hash: "trash-talk",
						}
					: challengeTarget(c)
			}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b> beat you and talked trash
			</p>
		</NotificationShell>
	)
}
