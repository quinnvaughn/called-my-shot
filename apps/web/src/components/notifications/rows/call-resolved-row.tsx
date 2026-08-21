import { FiCheckCircle, FiXCircle } from "react-icons/fi"
import { css } from "styled-system/css"
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
		? { to: "/questions/$questionId", params: { questionId: n.question.id } }
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
				n.pointsDelta !== null ? <PointsPill points={n.pointsDelta} /> : null
			}
		>
			<p className={css({ fontSize: "sm" })}>
				Your call on "{n.questionTitle}"{" "}
				{result?.status === "win" ? "hit" : "missed"}
			</p>
		</NotificationShell>
	)
}

// Same success/danger token pattern ResultBadge uses for a call's own
// points - reused here rather than a second convention for "did I win or
// lose points".
function PointsPill({ points }: { points: number }) {
	const result = resultState(points)
	if (result.status === "pending") return null
	return (
		<span
			className={css({
				fontSize: "xs",
				fontFamily: "mono",
				fontWeight: "bold",
				whiteSpace: "nowrap",
				padding: "{spacing.1} {spacing.2.5}",
				borderRadius: "sm",
				color: result.status === "win" ? "success.default" : "danger.default",
				backgroundColor:
					result.status === "win" ? "success.subtle" : "danger.subtle",
			})}
		>
			{result.status === "win" ? "+" : ""}
			{result.points} PTS
		</span>
	)
}
