import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { ShareIconRow } from "#/components/ui/share-icon-row"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"

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

	const signed = `${call.isWin ? "+" : "−"}${Math.abs(call.points)}`
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
	const url = `${SITE_ORIGIN}/calls/${callId}`
	const displayUrl = `${SITE_HOST}/calls/${callId}`

	if (layout === "icons") {
		return (
			<ShareIconRow
				url={url}
				campaign="call"
				tweetText={tweetText}
				shareTitle={shareTitle}
				onShared={(method) =>
					track("call_link_shared", { callId, method, surface })
				}
			/>
		)
	}

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				campaign="call"
				displayUrl={displayUrl}
				shareTitle={shareTitle}
				onCopied={() =>
					track("call_link_shared", { callId, method: "clipboard", surface })
				}
				onNativeShared={() =>
					track("call_link_shared", { callId, method: "native", surface })
				}
			/>
			<PostOnXLink
				text={tweetText}
				url={url}
				campaign="call"
				onClick={() =>
					track("call_link_shared", { callId, method: "x", surface })
				}
			/>
		</VStack>
	)
}
