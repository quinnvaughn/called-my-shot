import { GROUP_PINS_MAX } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import { FiChevronDown, FiChevronUp, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"
import { buildQuestionSlug } from "#/lib/slug"
import { useGroupPinActions } from "./use-group-pin-actions"

export const GroupPinsSectionPinFragment = graphql(`
	fragment GroupPinsSection_pin on GroupPin {
		id
		memberCallCount
		question {
			id
			title
		}
	}
`)

type Props = {
	groupId: string
	pins: FragmentType<typeof GroupPinsSectionPinFragment>[]
}

const rowButton = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "8",
	height: "8",
	flexShrink: 0,
	borderRadius: "lg",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "fg.default", bg: "bg.subtle" },
	_disabled: { opacity: 0.35, cursor: "default", _hover: { bg: "none" } },
})

// Admins only, like the rest of the group's own settings. Pins save as soon
// as they're moved or removed.
export function GroupPinsSection({ groupId, pins: pinsProp }: Props) {
	const pins = useFragment(GroupPinsSectionPinFragment, pinsProp)
	const { move, unpin, pending, error } = useGroupPinActions(groupId)
	const ids = pins.map((pin) => pin.id)

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<FieldLabel>
						Pinned questions · {pins.length}/{GROUP_PINS_MAX}
					</FieldLabel>
					<FieldHint>
						Pin up to {GROUP_PINS_MAX} open questions from a question's Share
						menu. They show at the top of the group page, and a pin drops off
						when its question locks.
					</FieldHint>
					{pins.length === 0 ? (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.subtle",
							})}
						>
							Nothing pinned.
						</span>
					) : (
						<VStack gap="0" alignItems="stretch">
							{pins.map((pin, index) => (
								<HStack
									key={pin.id}
									gap="1"
									className={css({
										paddingBlock: "2",
										borderBottom: "1px solid {colors.border.default}",
										_last: { borderBottom: "none" },
									})}
								>
									<VStack
										gap="0.5"
										alignItems="flex-start"
										className={css({ flex: "1", minWidth: "0" })}
									>
										<Link
											to="/questions/$questionId/{-$slug}"
											params={{
												questionId: pin.question.id,
												slug: buildQuestionSlug(pin.question.title),
											}}
											className={css({
												fontSize: "sm",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												maxWidth: "full",
												_hover: { textDecoration: "underline" },
											})}
										>
											{pin.question.title}
										</Link>
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												color: "fg.subtle",
											})}
										>
											{pin.memberCallCount}{" "}
											{pluralize(pin.memberCallCount, "member")} called
										</span>
									</VStack>
									<button
										type="button"
										className={rowButton}
										aria-label="Move up"
										disabled={pending || index === 0}
										onClick={() => move(ids, index, index - 1)}
									>
										<FiChevronUp size={16} />
									</button>
									<button
										type="button"
										className={rowButton}
										aria-label="Move down"
										disabled={pending || index === pins.length - 1}
										onClick={() => move(ids, index, index + 1)}
									>
										<FiChevronDown size={16} />
									</button>
									<button
										type="button"
										className={rowButton}
										aria-label="Unpin"
										disabled={pending}
										onClick={() => unpin(pin.id)}
									>
										<FiX size={16} />
									</button>
								</HStack>
							))}
						</VStack>
					)}
					<FormError message={error} />
				</VStack>
			</Card.Body>
		</Card>
	)
}
