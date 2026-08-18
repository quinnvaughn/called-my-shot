import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CallIdentityRow } from "./call-identity-row"
import { CallLockedBox } from "./call-locked-box"
import { CaseBlock } from "./case-block"
import { PickSummaryRow } from "./pick-summary-row"

export const CallRowFragment = graphql(`
	fragment CallRow_call on Call {
		id
		guessValue
		conviction
		totalPoints
		caseText
		viewerCanSeePick
		createdAt
		callerLeagueAccuracy
		user {
			name
			username
		}
		question {
			id
			type
			ouLine
			league {
				id
				abbreviation
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
// question's own detail page repeating the question's title/tags/creator on
// every row would be redundant. Otherwise the same lock-gated shape:
// identity always visible (this IS activity, not pick info), then either the
// pick + case or a locked placeholder.
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
			<CallIdentityRow
				name={call.user.name}
				username={call.user.username}
				leagueAccuracy={call.callerLeagueAccuracy}
				leagueAbbreviation={call.question.league.abbreviation}
				createdAt={call.createdAt}
			/>
			{call.viewerCanSeePick ? (
				<VStack
					gap="2"
					alignItems="stretch"
					className={css({
						background: "bg.canvas",
						borderRadius: "md",
						padding: "2.5",
					})}
				>
					<PickSummaryRow call={call} />
				</VStack>
			) : (
				<CallLockedBox name={call.user.name} />
			)}
			{call.viewerCanSeePick && call.caseText && (
				<CaseBlock text={call.caseText} />
			)}
		</VStack>
	)
}
