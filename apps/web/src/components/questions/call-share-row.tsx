import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"
import { formatSigned } from "#/lib/format-number"

type CallShareSurface = "call_page" | "question_detail"

type Props = {
	callId: string
	// What the tweet says. Built by buildCallTweet below, which the caller
	// applies because only it knows whether the call has settled.
	tweetText: string
	shareTitle: string
	surface: CallShareSurface
	// "full" is the call page's: the link in a field, Copy, and a Post on X
	// button. "icons" is one row of icon buttons for a card where sharing is
	// one thing among several.
	layout?: "full" | "icons"
}

// The tweet is deliberately short and hashtag-free. The og card carries the
// pick, the conviction, the field, the case and the date, so anything said
// here is said twice - worse the second time.
//
// First person only when it's actually your call. A call page is public and
// anyone can share anyone's, so the first-person version on someone else's
// record would put you on X claiming a call you didn't make.
// A union rather than `isOwn: boolean` + an always-required username: the
// first-person text never names anyone, so carrying a username through the
// one call site that can't supply it would mean threading a prop only to
// ignore it - and an optional username would let the attributed branch ship
// without one.
type TweetAuthor = { isOwn: true } | { isOwn: false; username: string }

export function buildCallTweet(
	call: {
		pickLabel: string
		points: number | null
		isWin: boolean | null
		calledAt: string
	} & TweetAuthor,
): string {
	if (call.points === null || call.isWin === null) {
		return call.isOwn
			? `On the record: ${call.pickLabel}. Called ${call.calledAt}.`
			: `@${call.username} called ${call.pickLabel} on ${call.calledAt}.`
	}

	const signed = formatSigned(call.points, { zeroSign: true })
	if (call.isWin) {
		return call.isOwn
			? `Called it: ${call.pickLabel}. ${signed} pts.`
			: `@${call.username} called it: ${call.pickLabel}. ${signed} pts.`
	}
	return call.isOwn
		? `I called ${call.pickLabel}. Didn't happen. ${signed} pts.`
		: `@${call.username} called ${call.pickLabel}. Didn't happen. ${signed} pts.`
}

export function CallShareRow({
	callId,
	tweetText,
	shareTitle,
	surface,
	layout = "full",
}: Props) {
	return (
		<ShareLinkRow
			path={`/calls/${callId}`}
			campaign="call"
			tweetText={tweetText}
			shareTitle={shareTitle}
			layout={layout}
			onShared={(method) =>
				track("call_link_shared", { callId, method, surface })
			}
		/>
	)
}
