import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"
import { sweepPath } from "#/lib/streak-meta"

type Props = {
	userId: string
	// Whose sweep the link points at.
	username: string
	leagueSlug: string
	slateKey: string
	// Built by buildSweepTweet, which the caller applies because only it
	// knows whose page this is.
	tweetText: string
	shareTitle: string
	// "icons" for a card footer, where sharing is one thing among several.
	layout?: "full" | "icons"
}

export function SweepShareRow({
	userId,
	username,
	leagueSlug,
	slateKey,
	tweetText,
	shareTitle,
	layout = "full",
}: Props) {
	const props = { userId, league: leagueSlug, slateKey }

	return (
		<ShareLinkRow
			path={sweepPath(username, leagueSlug, slateKey)}
			campaign="sweep"
			tweetText={tweetText}
			shareTitle={shareTitle}
			layout={layout}
			onShared={(method) => track("sweep_link_shared", { ...props, method })}
		/>
	)
}
