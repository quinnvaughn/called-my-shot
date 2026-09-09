import { Link } from "@tanstack/react-router"
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
					toleranceValue
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
//
// Links to that call's own permanent page. This list is the one place every
// call on a question is visible at once, so it's the one place each of them
// has to be reachable from - without it a call is only linkable if you made
// it yourself and it has already resolved.
export function CallRow({ call: callProp }: Props) {
	const call = useFragment(CallRowFragment, callProp)

	return (
		<Link
			to="/calls/$callId"
			params={{ callId: call.id }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<VStack
				gap="2.5"
				alignItems="stretch"
				className={css({
					background: "card",
					border: "1px solid {colors.border.default}",
					borderRadius: "md",
					padding: "3",
					transition: "border-color 0.15s ease",
					_hover: { borderColor: "border.emphasized" },
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
		</Link>
	)
}
