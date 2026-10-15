import { FiCheckCircle, FiXCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { SignedPoints } from "#/components/ui/signed-points"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { resultState } from "#/lib/call-summary"
import { NotificationShell, type Target } from "../notification-shell"

export const CallResolvedRowFragment = graphql(`
	fragment CallResolvedRow_notification on CallResolvedNotification {
		id
		createdAt
		questionTitle
		pointsDelta
		question {
			id
		}
		call {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof CallResolvedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

export function CallResolvedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(CallResolvedRowFragment, notificationProp)
	const result = n.pointsDelta !== null ? resultState(n.pointsDelta) : null
	const target: Target = n.question
		? {
				to: "/questions/$questionId/{-$slug}",
				params: { questionId: n.question.id },
			}
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={result?.status === "loss" ? FiXCircle : FiCheckCircle}
			target={target}
			onOpen={onOpen}
			trailing={
				n.pointsDelta !== null ? (
					<SignedPoints value={n.pointsDelta} zeroSign suffix=" PTS" pill />
				) : null
			}
		>
			<p className={css({ fontSize: "sm" })}>
				Your call on "{n.questionTitle}"{" "}
				{result?.status === "win" ? "hit" : "missed"}
			</p>
		</NotificationShell>
	)
}
