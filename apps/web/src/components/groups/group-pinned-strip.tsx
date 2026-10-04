import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { QuestionCard } from "#/components/questions/question-card"
import { CardRail } from "#/components/ui/card-rail"
import { FormError } from "#/components/ui/form-error"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"
import { useGroupPinActions } from "./use-group-pin-actions"

export const GroupPinnedStripPinFragment = graphql(`
	fragment GroupPinnedStrip_pin on GroupPin {
		id
		memberCallCount
		question {
			id
			...QuestionCard_question
		}
	}
`)

type Props = {
	groupId: string
	pins: FragmentType<typeof GroupPinnedStripPinFragment>[]
	viewerIsAdmin: boolean
}

const controlButton = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "7",
	height: "7",
	borderRadius: "md",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "fg.default", bg: "bg.subtle" },
	_disabled: { opacity: 0.35, cursor: "default", _hover: { bg: "none" } },
})

// The questions the group's admins recommend calling, at the top of the group
// page in their order. Admins can reorder and unpin from here; pinning
// happens from a question's Share menu. Renders nothing when nothing is
// pinned.
export function GroupPinnedStrip({
	groupId,
	pins: pinsProp,
	viewerIsAdmin,
}: Props) {
	const pins = useFragment(GroupPinnedStripPinFragment, pinsProp)
	const { move, unpin, pending, error } = useGroupPinActions(groupId)
	if (pins.length === 0) return null
	const ids = pins.map((pin) => pin.id)

	return (
		<VStack gap="2" alignItems="stretch">
			<CardRail
				items={pins.map((pin, index) => ({ pin, index }))}
				getKey={({ pin }) => pin.id}
				itemLabel="pinned question"
				header={
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							letterSpacing: "wide",
							color: "fg.muted",
							textTransform: "uppercase",
						})}
					>
						Pinned
					</span>
				}
				renderItem={({ pin, index }) => (
					<VStack gap="1.5" alignItems="stretch" height="full">
						<div className={css({ flex: "1" })}>
							<QuestionCard question={pin.question} />
						</div>
						<HStack justify="space-between" gap="2" minHeight="7">
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
								})}
							>
								{pin.memberCallCount} {pluralize(pin.memberCallCount, "member")}{" "}
								called
							</span>
							{viewerIsAdmin && (
								<HStack gap="0.5">
									<button
										type="button"
										className={controlButton}
										aria-label="Move left"
										disabled={pending || index === 0}
										onClick={() => move(ids, index, index - 1)}
									>
										<FiChevronLeft size={15} />
									</button>
									<button
										type="button"
										className={controlButton}
										aria-label="Move right"
										disabled={pending || index === pins.length - 1}
										onClick={() => move(ids, index, index + 1)}
									>
										<FiChevronRight size={15} />
									</button>
									<button
										type="button"
										className={controlButton}
										aria-label="Unpin"
										disabled={pending}
										onClick={() => unpin(pin.id)}
									>
										<FiX size={15} />
									</button>
								</HStack>
							)}
						</HStack>
					</VStack>
				)}
			/>
			<FormError message={error} />
		</VStack>
	)
}
