import { StreakTag } from "#/components/questions/streak-tag"
import { useFragment } from "#/graphql/generated"
import { streakStakeText } from "#/lib/streak-meta"
import {
	GameCardExtrasFragment,
	type GameCardExtrasProps,
} from "./game-card-extras"

// The viewer's live run this call would extend, on a card they haven't
// called yet. Null otherwise, and below the run length worth a tag.
export function GameCardStreak({
	question: questionProp,
}: GameCardExtrasProps) {
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
