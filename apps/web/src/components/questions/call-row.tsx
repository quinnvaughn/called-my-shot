import { FaLock } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { PickSummaryRow } from "./pick-summary-row"

export const CallRowFragment = graphql(`
	fragment CallRow_call on Call {
		id
		guessValue
		conviction
		totalPoints
		caseText
		viewerCanSeePick
		user {
			name
		}
		question {
			type
			ouLine
		}
		selections {
			id
			conviction
			option {
				id
				label
				isCorrect
			}
		}
	}
`)

type Props = {
	call: FragmentType<typeof CallRowFragment>
	// Defaults to the caller's name - overridden to "You" for the viewer's own
	// row, same convention CallCard uses.
	label?: string
}

// Lighter than CallCard - skips QuestionSummaryHeader entirely, since on the
// question's own detail page repeating the question's title/tags/creator on
// every row would be redundant. Otherwise the same lock-gated shape:
// PickSummaryRow + optional case text once visible, a "make your call to
// reveal" placeholder until then.
export function CallRow({ call: callProp, label: labelProp }: Props) {
	const call = useFragment(CallRowFragment, callProp)
	const label = labelProp ?? call.user.name

	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				background: "card",
				border: "1px solid {colors.border.default}",
				borderRadius: "md",
				padding: "3",
			})}
		>
			{call.viewerCanSeePick ? (
				<>
					<PickSummaryRow call={call} label={label} />
					{call.caseText && (
						<span
							className={css({
								fontSize: "xs",
								color: "fg.subtle",
								fontStyle: "italic",
							})}
						>
							"{call.caseText}"
						</span>
					)}
				</>
			) : (
				<HStack gap="2" alignItems="center">
					<FaLock
						size={12}
						className={css({ color: "fg.subtle", flexShrink: "0" })}
					/>
					<span
						className={css({
							fontSize: "xs",
							color: "fg.subtle",
							fontFamily: "mono",
						})}
					>
						{label} called this — make your call to reveal
					</span>
				</HStack>
			)}
		</VStack>
	)
}
