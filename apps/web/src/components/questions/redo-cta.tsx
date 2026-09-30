import { REDO_BALANCE_CAP } from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import { FiRotateCcw } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { OutOfRedosModal } from "#/components/questions/out-of-redos-modal"
import { InfoTip } from "#/components/ui/info-tip"
import { track } from "#/lib/analytics"
import { openModal } from "#/stores/modal-store"

// Where the pick form is relative to this row. The question page owns the
// form, so it opens it in place; the call page doesn't have one, so it sends
// the caller to the question instead of duplicating the whole picker on a
// page whose job is stating a record.
export type RedoAction =
	| { kind: "open"; onStart: () => void }
	// slug is optional the same way the route's {-$slug} segment is - a
	// missing one redirects to the canonical path rather than 404ing.
	| { kind: "navigate"; questionId: string; slug: string | undefined }

// Everything the row needs beyond the question it belongs to. Null when the
// call can't be redone at all, which is the overwhelming majority of calls.
export type RedoOffer = {
	questionShape: QuestionCallShape
	balance: number
	action: RedoAction
}

// The detail behind the offer, in the InfoTip rather than on the row: what a
// redo costs, and where more come from. The row itself only has space for the
// offer and a way to earn another, so anyone asking "what does this actually
// do to my call" is asking here.
const REDO_HINT =
	"Changes your pick before this question locks. One per question, and the call carries a redo badge afterwards. Your earliness resets to the time of the redo. You earn them by inviting people: they get a redo at signup, and you get one once they make their first call."

// A small bordered button, the same weight as the share icons beside it on
// the card: a real action on the call, but not the card's subject.
const actionClass = css({
	display: "inline-flex",
	alignItems: "center",
	gap: "1.5",
	flexShrink: "0",
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.default",
	background: "transparent",
	border: "1px solid {colors.border.default}",
	borderRadius: "md",
	paddingInline: "3",
	height: { base: "11", sm: "9" },
	cursor: "pointer",
	textDecoration: "none",
	transition: "background-color 0.15s ease",
	_hover: { backgroundColor: "bg.subtle" },
})

const earnClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
	textDecoration: "none",
	whiteSpace: "nowrap",
	_hover: { color: "fg.default" },
})

const countClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

// The offer to take this call back, sat inside the card that already states
// the call. Deliberately not a card of its own: a redo is a small action on
// an existing call, not a second subject on the page.
//
// One row: the action and how many are left on one side, where more come
// from on the other. The earn link is there at every balance, not just at
// zero - "where do redos come from" is the question someone has the moment
// they find out redos exist, and at one or two left nothing else on screen
// answers it.
export function RedoCta({
	questionId,
	offer,
}: {
	questionId: string
	offer: RedoOffer | null
}) {
	if (!offer) return null

	const trackStart = () =>
		track("redo_started", {
			questionId,
			questionShape: offer.questionShape,
			balance: offer.balance,
		})

	const action = (
		<>
			<FiRotateCcw aria-hidden size={13} />
			<span>Redo pick</span>
		</>
	)

	return (
		<HStack justify="space-between" gap="3" flexWrap="wrap">
			<HStack gap="2.5" alignItems="center">
				{offer.balance === 0 ? (
					// Still offered at zero, and the click opens how to earn one
					// instead of the pick form.
					<button
						type="button"
						className={actionClass}
						onClick={() =>
							openModal(<OutOfRedosModal questionId={questionId} />)
						}
					>
						{action}
					</button>
				) : (
					match(offer.action)
						.with({ kind: "open" }, ({ onStart }) => (
							<button
								type="button"
								className={actionClass}
								onClick={() => {
									trackStart()
									onStart()
								}}
							>
								{action}
							</button>
						))
						.with({ kind: "navigate" }, ({ questionId: id, slug }) => (
							<Link
								to="/questions/$questionId/{-$slug}"
								params={{ questionId: id, slug }}
								className={actionClass}
								onClick={trackStart}
							>
								{action}
							</Link>
						))
						.exhaustive()
				)}
				<HStack gap="1" alignItems="center">
					<span className={countClass}>
						{offer.balance} of {REDO_BALANCE_CAP} left
					</span>
					<InfoTip label="redos" text={REDO_HINT} />
				</HStack>
			</HStack>

			<Link
				to="/invite"
				className={earnClass}
				onClick={() =>
					track("redo_invite_clicked", {
						questionId,
						balance: offer.balance,
					})
				}
			>
				Get more by inviting →
			</Link>
		</HStack>
	)
}
