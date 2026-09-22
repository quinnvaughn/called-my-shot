import { Modal } from "#/components/ui/modal"
import { buildGameTweet, GameShareRow } from "./game-share-row"

type Props = {
	gameId: string
	username: string
	matchup: string
	summary: {
		calledCount: number
		questionCount: number
		wins: number
		losses: number
		points: number
	}
}

// The game strip's share action. Always your own picks: the strip only
// offers it to the signed-in viewer, about their calls.
export function GameShareModal({ gameId, username, matchup, summary }: Props) {
	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Share your {matchup} picks</Modal.Title>
			<GameShareRow
				gameId={gameId}
				username={username}
				shareTitle={`@${username}'s ${matchup} picks`}
				surface="question_strip"
				tweetText={buildGameTweet({ matchup, ...summary, isOwn: true })}
			/>
		</Modal>
	)
}
