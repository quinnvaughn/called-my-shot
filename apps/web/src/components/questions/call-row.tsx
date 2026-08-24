import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CallLockedBox } from "./call-locked-box"
import { CaseBlock } from "./case-block"
import { PersonLine } from "./person-line"
import { PickList } from "./pick-list"

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
			username
		}
		question {
			id
			shape
			ouLine
			numericActualValue
			numericToleranceAbsolute
			stat {
				id
				toleranceTier {
					id
					toleranceMode
				}
			}
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
}

// Lighter than CallCard - skips QuestionSummaryHeader entirely, since on the
// question's own detail page repeating the question's title/game/status on
// every row would be redundant (shown once at the top of the page instead).
// No status badge here either, for the same reason - just identity, then
// either the pick + case or a locked placeholder.
export function CallRow({ call: callProp }: Props) {
	const call = useFragment(CallRowFragment, callProp)

	return (
		<VStack
			gap="2.5"
			alignItems="stretch"
			className={css({
				background: "card",
				border: "1px solid {colors.border.default}",
				borderRadius: "md",
				padding: "3",
			})}
		>
			<PersonLine name={call.user.name} username={call.user.username} />
			{call.viewerCanSeePick ? (
				<PickList call={call} />
			) : (
				<CallLockedBox name={call.user.name} />
			)}
			{call.viewerCanSeePick && call.caseText && (
				<CaseBlock text={call.caseText} clampable />
			)}
		</VStack>
	)
}
