import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { DisputeModal } from "#/components/questions/dispute-modal"
import { LiveDot } from "#/components/ui/live-dot"
import type { DisputeAction } from "#/lib/viewer-status"
import { openModal } from "#/stores/modal-store"

const disputeRowClass = css({
	marginTop: "1",
	paddingTop: "3",
	borderTop: "1px solid {colors.border.default}",
})

const disputeLinkClass = css({
	textStyle: "label",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "primary.default" },
})

const disputeStatusClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.muted",
})

// Lives inside the same card as the outcome it's disputing - the mockup this
// was built from nested it in every settled banner (won/lost/resolved-no-
// call) rather than floating it as a separate element below unrelated
// content, and the earlier version of this page did the latter, gated on
// having called at all (which also meant a spectator could never dispute a
// resolution they hadn't personally bet on).
export function DisputeRow({
	questionId,
	action,
}: {
	questionId: string
	action: DisputeAction
}) {
	if (action === "hidden") return null

	return (
		<HStack
			justify="space-between"
			gap="2"
			flexWrap="wrap"
			className={disputeRowClass}
		>
			{match(action)
				.with("underReview", () => (
					<HStack gap="1.5" className={disputeStatusClass}>
						<LiveDot tone="current" />
						<span>
							UNDER REVIEW: you'll get a notification once it's settled
						</span>
					</HStack>
				))
				.with("available", () => (
					<button
						type="button"
						onClick={() => openModal(<DisputeModal questionId={questionId} />)}
						className={disputeLinkClass}
					>
						Dispute this resolution
					</button>
				))
				.exhaustive()}
		</HStack>
	)
}
