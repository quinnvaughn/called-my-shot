import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { reportCardPath } from "#/lib/report-card"

type Props = {
	userId: string
	// Whose report card the link points at.
	username: string
	leagueSlug: string
	windowKey: string
	// Built by buildReportCardTweet, which the caller applies because only it
	// knows whose page this is.
	tweetText: string
	shareTitle: string
}

// Mirrors SweepShareRow. The thing being shared is the url - the og:image
// only exists so that url unfurls with a preview, and is never shown here.
export function ReportCardShareRow({
	userId,
	username,
	leagueSlug,
	windowKey,
	tweetText,
	shareTitle,
}: Props) {
	const path = reportCardPath(username, leagueSlug, windowKey)
	const url = `${SITE_ORIGIN}${path}`
	const props = { userId, league: leagueSlug, windowKey }

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				displayUrl={`${SITE_HOST}${path}`}
				shareTitle={shareTitle}
				onCopied={() =>
					track("report_card_link_shared", { ...props, method: "clipboard" })
				}
				onNativeShared={() =>
					track("report_card_link_shared", { ...props, method: "native" })
				}
			/>
			<PostOnXLink
				text={tweetText}
				url={url}
				onClick={() =>
					track("report_card_link_shared", { ...props, method: "x" })
				}
			/>
		</VStack>
	)
}
