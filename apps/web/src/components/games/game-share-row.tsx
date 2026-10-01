import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { ShareIconRow } from "#/components/ui/share-icon-row"
import { track } from "#/lib/analytics"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { gameEntryPath } from "#/lib/game-entry"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"

type GameShareSurface = "game_page" | "question_strip" | "entry_page"

type Props = {
	gameId: string
	// Whose picks the link points at.
	username: string
	tweetText: string
	shareTitle: string
	surface: GameShareSurface
	// "full" is the modal's: the link in a field, Copy, and a Post on X
	// button. "icons" is one row of icon buttons, for beside a card's or a
	// row's other content.
	layout?: "full" | "icons"
}

// Same split as buildBallotTweet: first person only on your own picks, since
// a picks page is public and anyone can share anyone's.
type TweetAuthor = { isOwn: true } | { isOwn: false; username: string }

// Record and points only once a question has settled. Before that, how much
// of the game is called is the only thing there is to say.
export function buildGameTweet(
	entry: {
		matchup: string
		calledCount: number
		questionCount: number
		wins: number
		losses: number
		points: number
	} & TweetAuthor,
): string {
	const subject = `${entry.isOwn ? "My" : `@${entry.username}'s`} ${entry.matchup} picks`
	if (entry.wins + entry.losses === 0) {
		return `${subject}: ${entry.calledCount} of ${entry.questionCount} called.`
	}
	return `${subject}: ${formatRecord(entry.wins, entry.losses)}, ${formatSignedPoints(entry.points)} pts.`
}

export function GameShareRow({
	gameId,
	username,
	tweetText,
	shareTitle,
	surface,
	layout = "full",
}: Props) {
	const path = gameEntryPath(gameId, username)
	const url = `${SITE_ORIGIN}${path}`

	if (layout === "icons") {
		return (
			<ShareIconRow
				url={url}
				tweetText={tweetText}
				shareTitle={shareTitle}
				onShared={(method) =>
					track("game_picks_shared", { gameId, method, surface })
				}
			/>
		)
	}

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				displayUrl={`${SITE_HOST}${path}`}
				shareTitle={shareTitle}
				onCopied={() =>
					track("game_picks_shared", { gameId, method: "clipboard", surface })
				}
				onNativeShared={() =>
					track("game_picks_shared", { gameId, method: "native", surface })
				}
			/>
			<PostOnXLink
				text={tweetText}
				url={url}
				onClick={() =>
					track("game_picks_shared", { gameId, method: "x", surface })
				}
			/>
		</VStack>
	)
}
