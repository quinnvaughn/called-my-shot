import { graphql } from "#/graphql/generated"

// Everything CallSummaryData can hold, for cards that show the pick, its
// result context and its margin (PickList, a card's standing tag). Documents
// that only want a pick label select their own subset instead - see the
// comment on CallSummaryData in #/lib/call-summary.
export const CallSummaryFragment = graphql(`
	fragment CallSummary_call on Call {
		id
		guessValue
		conviction
		totalPoints
		question {
			id
			shape
			ouLine
			numericActualValue
			numericToleranceAbsolute
			numericTolerancePct
			scoredOptions {
				id
				label
				actualValue
			}
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
				actualValue
				team {
					...Team_team @unmask
				}
				player {
					id
					name
					headshotUrl
				}
			}
		}
	}
`)
