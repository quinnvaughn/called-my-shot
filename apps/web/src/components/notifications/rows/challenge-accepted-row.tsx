import { FiFlag } from "react-icons/fi"
import { challengeTarget } from "#/components/notifications/challenge-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChallengeAcceptedRowFragment = graphql(`
	fragment ChallengeAcceptedRow_notification on ChallengeAcceptedNotification {
		id
		createdAt
		actorUsername
		challenge {
			id
			code
			acceptanceCount
		}
	}
`)

// Someone took on the viewer's challenge - see acceptChallenge. One per
// challenge, naming whoever accepted last.
export function ChallengeAcceptedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengeAcceptedRowFragment>>) {
	const n = useFragment(ChallengeAcceptedRowFragment, notification)
	const others = (n.challenge?.acceptanceCount ?? 1) - 1
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={challengeTarget(n.challenge)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b>
				{others > 0 && ` and ${others} ${pluralize(others, "other")}`} took on
				your challenge
			</p>
		</NotificationShell>
	)
}
