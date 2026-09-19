import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { toIdentity } from "#/lib/identity"
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
		user {
			...Identity_user
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
// the pick and case.
//
// Links to that call's own permanent page. This list is the one place every
// call on a question is visible at once, so it's the one place each of them
// has to be reachable from - without it a call is only linkable if you made
// it yourself and it has already resolved.
export function CallRow({ call: callProp }: Props) {
	const call = useFragment(CallRowFragment, callProp)
	const caller = toIdentity(call.user)

	return (
		<VStack
			gap="2.5"
			alignItems="stretch"
			className={css({
				position: "relative",
				background: "card",
				border: "1px solid {colors.border.default}",
				borderRadius: "md",
				padding: "3",
				transition: "border-color 0.15s ease",
				_hover: { borderColor: "border.emphasized" },
			})}
		>
			{/* Stretched over the whole row instead of wrapping the row in an
			anchor, so CaseBlock's "Show more" button isn't nested inside a link.
			Absolutely positioned, it also stays out of the VStack's gap. */}
			<Link
				to="/calls/$callId"
				params={{ callId: call.id }}
				aria-label={`${caller.name}'s call`}
				className={css({
					position: "absolute",
					inset: "0",
					borderRadius: "md",
				})}
			/>
			<PersonLine
				name={caller.name}
				username={caller.username}
				flair={caller.flair}
			/>
			<PickList call={call} />
			{call.caseText && (
				<div className={css({ position: "relative", zIndex: 1 })}>
					<CaseBlock text={call.caseText} clampable />
				</div>
			)}
		</VStack>
	)
}
