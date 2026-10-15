import { type FragmentType, graphql } from "#/graphql/generated"

// What a game page adds to a question's card beyond the card itself: a line
// of recent form, which way the viewer's group-mates went, and the streak the
// call would extend. Its own fragment so only the game page and the next-up
// step fetch it, never the feeds QuestionCard also renders in.
export const GameCardExtrasFragment = graphql(`
	fragment GameCardExtras_question on Question {
		id
		status
		league {
			abbreviation
		}
		options {
			id
			label
			sortOrder
		}
		viewerCall {
			id
		}
		viewerStreak {
			familyLabel
			currentLength
			bestLength
		}
		cardFact {
			kind
			statLabel
			line
			sides {
				label
				games
				hits
				mean
			}
		}
		viewerGroupPicks {
			optionId
			count
			sampleUser {
				id
				name
				avatarUrl
			}
		}
	}
`)

export type GameCardExtrasProps = {
	question: FragmentType<typeof GameCardExtrasFragment>
}
