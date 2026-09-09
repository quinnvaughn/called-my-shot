import { FaXTwitter } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"

type CallShareSurface = "call_page" | "question_detail"

type Props = {
	callId: string
	// What the tweet says. Built by buildCallTweet below, which the caller
	// applies because only it knows whether the call has settled.
	tweetText: string
	shareTitle: string
	surface: CallShareSurface
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
}: Props) {
	const url = `${SITE_ORIGIN}/calls/${callId}`
	const displayUrl = `calledmyshot.com/calls/${callId}`

	// x.com/intent/post rather than twitter.com/intent/tweet: the old host
	// still 302s, but that adds a hop to the path a share takes. text and url
	// stay separate params so X joins them itself and doesn't count the url
	// against the character budget.
	const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(
		tweetText,
	)}&url=${encodeURIComponent(url)}`

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				displayUrl={displayUrl}
				shareTitle={shareTitle}
				onCopied={() =>
					track("call_link_shared", { callId, method: "clipboard", surface })
				}
				onNativeShared={() =>
					track("call_link_shared", { callId, method: "native", surface })
				}
			/>
			<a
				href={intentUrl}
				// A real navigation to x.com, not a popup this app should try to
				// manage.
				target="_blank"
				rel="noopener noreferrer"
				onClick={() =>
					track("call_link_shared", { callId, method: "x", surface })
				}
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: "2",
					paddingBlock: "2.5",
					borderRadius: "md",
					border: "1px solid {colors.border.default}",
					fontFamily: "mono",
					fontSize: "xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.default",
					textDecoration: "none",
					cursor: "pointer",
					transition: "background-color 0.15s ease",
					_hover: { backgroundColor: "bg.subtle" },
				})}
			>
				<HStack gap="2" alignItems="center">
					<FaXTwitter size={14} />
					Post on X
				</HStack>
			</a>
		</VStack>
	)
}
