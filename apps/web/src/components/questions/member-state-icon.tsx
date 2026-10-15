import { FaCheck, FaXmark } from "react-icons/fa6"
import { css, cx } from "styled-system/css"
import type { BallotMemberState } from "#/lib/ballot-member-state"

const stateIconClass: Record<BallotMemberState, string> = {
	uncalled: css({ border: "1px solid {colors.fg.subtle}" }),
	// Filled but neutral (not primary-colored) - the tone that carries
	// meaning here is won/lost, not "in progress", so pending stays gray.
	pending: css({
		backgroundColor: "fg.subtle",
		border: "1px solid {colors.fg.subtle}",
	}),
	won: css({
		backgroundColor: "success.default/15",
		border: "1px solid {colors.success.default/50}",
		color: "success.default",
	}),
	lost: css({
		backgroundColor: "danger.default/15",
		border: "1px solid {colors.danger.default/50}",
		color: "danger.default",
	}),
	missed: css({
		border: "1px dashed {colors.fg.subtle}",
		opacity: 0.5,
	}),
	voided: css({
		border: "1px solid {colors.fg.subtle}",
		opacity: 0.5,
	}),
}

export function MemberStateIcon({ state }: { state: BallotMemberState }) {
	return (
		<div
			className={cx(
				// Fixed 14px regardless of state - this is a row-list glyph, not
				// the bigger PickStateIcon used on a pick card, so it isn't reused
				// here (that component's own size serves a different context and
				// shouldn't be pulled off its token to fit this one).
				css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "14px",
					height: "14px",
					borderRadius: "full",
					flexShrink: "0",
				}),
				stateIconClass[state],
			)}
		>
			{state === "won" && <FaCheck size={8} />}
			{state === "lost" && <FaXmark size={8} />}
		</div>
	)
}
