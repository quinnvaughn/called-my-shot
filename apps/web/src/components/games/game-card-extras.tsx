import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { StreakTag } from "#/components/questions/streak-tag"
import { Avatar } from "#/components/ui/avatar"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { cardFactParts } from "#/lib/card-fact"
import { groupPicksLine } from "#/lib/group-picks"
import { streakStakeText } from "#/lib/streak-meta"

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

type Props = { question: FragmentType<typeof GameCardExtrasFragment> }

const lineClass = css({
	fontSize: "xs",
	color: "fg.muted",
	lineHeight: "snug",
})

// The fact and the group line, stacked. Renders nothing when neither has
// anything to say.
export function GameCardContext({ question: questionProp }: Props) {
	const question = useFragment(GameCardExtrasFragment, questionProp)
	const fact = question.cardFact ? cardFactParts(question.cardFact) : null
	const group = groupPicksLine(question.viewerGroupPicks, question.options)
	if (!fact && !group) return null

	return (
		<VStack gap="1.5" alignItems="stretch">
			{fact && (
				<span className={lineClass}>
					{fact.map((part, i) =>
						typeof part === "string" ? (
							part
						) : (
							<span
								// Positional: the parts are a fixed sentence, never reordered.
								// biome-ignore lint/suspicious/noArrayIndexKey: see above
								key={i}
								className={css({
									fontFamily: "mono",
									fontWeight: "semibold",
									color: "secondary.default",
								})}
							>
								{part.figure}
							</span>
						),
					)}
				</span>
			)}
			{group && (
				<HStack gap="2" alignItems="center">
					<Avatar
						name={group.sampleUser.name}
						src={group.sampleUser.avatarUrl}
						size="xs"
					/>
					<span className={lineClass}>{group.text}</span>
				</HStack>
			)}
		</VStack>
	)
}

// The viewer's live run this call would extend, on a card they haven't
// called yet. Null otherwise, and below the run length worth a tag.
export function GameCardStreak({ question: questionProp }: Props) {
	const question = useFragment(GameCardExtrasFragment, questionProp)
	const stake = question.viewerStreak
	if (question.status !== "OPEN" || question.viewerCall || !stake) return null
	const track = `${question.league.abbreviation} ${stake.familyLabel}`
	return (
		<StreakTag
			length={stake.currentLength}
			track={track}
			label={streakStakeText({
				track,
				currentLength: stake.currentLength,
				bestLength: stake.bestLength,
			})}
		/>
	)
}
