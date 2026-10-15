import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"
import { ballotEntryPath } from "#/lib/ballot-entry"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"

type BallotShareSurface = "ballot_page" | "entry_page" | "question_rail"

type Props = {
	ballotId: string
	ballotSlug: string
	// Whose entry the link points at.
	username: string
	tweetText: string
	shareTitle: string
	surface: BallotShareSurface
	// "full" is the link in a field, Copy, and a Post on X button. "icons" is
	// one row of icon buttons, for a card footer.
	layout?: "full" | "icons"
}

// Same split as buildCallTweet: first person only on your own ballot, since
// an entry page is public and anyone can share anyone's.
type TweetAuthor = { isOwn: true } | { isOwn: false; username: string }

// Record and points only once a member has settled. Before that, how much of
// the ballot is called is the only thing there is to say.
export function buildBallotTweet(
	entry: {
		ballotName: string
		calledCount: number
		memberCount: number
		wins: number
		losses: number
		points: number
	} & TweetAuthor,
): string {
	const subject = `${entry.isOwn ? "My" : `@${entry.username}'s`} ${entry.ballotName} ballot`
	if (entry.wins + entry.losses === 0) {
		return `${subject}: ${entry.calledCount} of ${entry.memberCount} called.`
	}
	return `${subject}: ${formatRecord(entry.wins, entry.losses)}, ${formatSigned(entry.points, { zeroSign: true })} pts.`
}

export function BallotShareRow({
	ballotId,
	ballotSlug,
	username,
	tweetText,
	shareTitle,
	surface,
	layout = "full",
}: Props) {
	return (
		<ShareLinkRow
			path={ballotEntryPath(ballotSlug, username)}
			campaign="ballot"
			tweetText={tweetText}
			shareTitle={shareTitle}
			layout={layout}
			onShared={(method) =>
				track("ballot_link_shared", { ballotId, method, surface })
			}
		/>
	)
}
