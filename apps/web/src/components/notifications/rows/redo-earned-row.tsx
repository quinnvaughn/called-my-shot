import { FiRotateCcw } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const RedoEarnedRowFragment = graphql(`
	fragment RedoEarnedRow_notification on RedoEarnedNotification {
		id
		createdAt
		actorUsername
	}
`)

type Props = {
	notification: FragmentType<typeof RedoEarnedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Someone this user invited made their first call, so the referrer's half of
// the invite paid out - see qualifyReferralOnFirstCall. Also fires when a
// credit that was waiting on a full wallet is finally granted, which is the
// other moment a redo actually appears to spend.
//
// Points at the invite screen rather than at the invitee: the useful next
// action is spending the redo or sending another link, not looking someone up.
export function RedoEarnedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(RedoEarnedRowFragment, notificationProp)
	const target: Target = { to: "/invite" }

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiRotateCcw}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b> made their first call. You earned a redo.
			</p>
		</NotificationShell>
	)
}
