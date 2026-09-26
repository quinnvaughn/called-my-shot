import { FiMessageCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { gloatText } from "#/lib/fade-copy"
import { NotificationShell, type Target } from "../notification-shell"

export const FadeGloatedRowFragment = graphql(`
	fragment FadeGloatedRow_notification on FadeGloatedNotification {
		id
		createdAt
		actorUsername
		questionTitle
		gloat
		call {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof FadeGloatedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// The side that won a fade against this user used its one gloat - see gloat
// in apps/api/src/lib/fades.ts. Opens the recipient's own losing call.
export function FadeGloatedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(FadeGloatedRowFragment, notificationProp)
	const target: Target = n.call
		? { to: "/calls/$callId", params: { callId: n.call.id } }
		: null
	// Unknown once either call is gone, in which case the row still says who
	// gloated without putting words in their mouth.
	const said = n.gloat ? gloatText(n.gloat) : null

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
				<b>@{n.actorUsername}</b> {said ? `says "${said}"` : "gloated"} on "
				{n.questionTitle}"
			</p>
		</NotificationShell>
	)
}
