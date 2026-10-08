import { ShareIconRow } from "#/components/ui/share-icon-row"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
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

// The thing being shared is the permalink url, from either the inline card or
// the permalink itself - the og:image only exists so that url unfurls with a
// preview, and is never shown here.
export function ReportCardShareRow({
	userId,
	username,
	leagueSlug,
	windowKey,
	tweetText,
	shareTitle,
}: Props) {
	return (
		<ShareIconRow
			url={`${SITE_ORIGIN}${reportCardPath(username, leagueSlug, windowKey)}`}
			campaign="report_card"
			tweetText={tweetText}
			shareTitle={shareTitle}
			onShared={(method) =>
				track("report_card_link_shared", {
					userId,
					league: leagueSlug,
					windowKey,
					method,
				})
			}
		/>
	)
}
