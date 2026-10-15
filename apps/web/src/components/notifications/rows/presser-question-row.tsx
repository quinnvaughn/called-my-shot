import { FiMessageCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { matchupLabel } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"
import { NotificationShell, type Target } from "../notification-shell"

export const PresserQuestionRowFragment = graphql(`
	fragment PresserQuestionRow_notification on PresserQuestionReceivedNotification {
		id
		createdAt
		actorUsername
		presser {
			id
			isOpen
			pendingCount
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
	notification: FragmentType<typeof PresserQuestionRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Someone asked a question at the viewer's presser - see askPresserQuestion.
// One row per presser, unread again with each later question. Opens the
// picks page the presser sits on.
export function PresserQuestionRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(PresserQuestionRowFragment, notificationProp)
	const { presser } = n
	const target: Target = presser
		? {
				to: "/games/$gameId/picks/$username",
				params: { gameId: presser.game.id, username: presser.owner.username },
			}
		: null
	const matchup = presser ? matchupLabel(presser.game) : "your game"
	const waiting = presser?.isOpen ? (presser.pendingCount ?? 0) : 0
	const others = waiting - 1

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiMessageCircle}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b>
				{others > 0
					? ` and ${others} ${pluralize(others, "other")} asked questions`
					: " asked a question"}{" "}
				at your {matchup} presser
			</p>
		</NotificationShell>
	)
}
