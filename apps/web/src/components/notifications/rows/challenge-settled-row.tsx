import { FiFlag } from "react-icons/fi"
import { outcomeForSide } from "#/components/challenges/matchup-list"
import { challengeTarget } from "#/components/notifications/challenge-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { formatRecord } from "#/lib/game-status"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChallengeSettledRowFragment = graphql(`
	fragment ChallengeSettledRow_notification on ChallengeSettledNotification {
		id
		createdAt
		challenge {
			id
			code
			state
			creator {
				id
				username
			}
			creatorTally {
				wins
				losses
				draws
			}
			viewerMatchup {
				id
				outcome
				acceptor {
					id
					username
				}
			}
		}
	}
`)

// A challenge the viewer is in is over - see notifyChallengesSettled.
export function ChallengeSettledRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengeSettledRowFragment>>) {
	const n = useFragment(ChallengeSettledRowFragment, notification)
	const me = useMe()
	const c = n.challenge
	const message = (() => {
		if (!c) return "A challenge you were in is over"
		if (c.state === "VOIDED")
			return "Every question in a challenge you were in was voided"
		if (c.creator.id === me?.id) {
			return `Your challenge is final: you went ${formatRecord(c.creatorTally.wins, c.creatorTally.losses, c.creatorTally.draws || null)}`
		}
		const outcome = c.viewerMatchup?.outcome
		return outcome
			? `Your 1v1 with @${c.creator.username} is final. ${outcomeForSide(outcome, "acceptor")}.`
			: `Your 1v1 with @${c.creator.username} is final`
	})()
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={challengeTarget(c)}
			onOpen={onOpen}
		>
			<p className={text}>{message}</p>
		</NotificationShell>
	)
}
