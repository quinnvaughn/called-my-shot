import { FiMessageSquare } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const PresserAnsweredRowFragment = graphql(`
	fragment PresserAnsweredRow_notification on PresserAnsweredNotification {
		id
		createdAt
		actorUsername
		presser {
			id
			owner {
				id
				username
			}
			game {
				id
				homeTeam {
					abbreviation
				}
				awayTeam {
					abbreviation
				}
			}
		}
	}
`)

type Props = {
	notification: FragmentType<typeof PresserAnsweredRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// The owner of a presser answered the viewer's question - see
// answerPresserQuestion. "No comment" counts.
export function PresserAnsweredRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(PresserAnsweredRowFragment, notificationProp)
	const { presser } = n
	const target: Target = presser
		? {
				to: "/games/$gameId/picks/$username",
				params: { gameId: presser.game.id, username: presser.owner.username },
			}
		: null
	const matchup = presser
		? ` at their ${presser.game.awayTeam.abbreviation} @ ${presser.game.homeTeam.abbreviation} presser`
		: ""

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiMessageSquare}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b> answered your question{matchup}
			</p>
		</NotificationShell>
	)
}
