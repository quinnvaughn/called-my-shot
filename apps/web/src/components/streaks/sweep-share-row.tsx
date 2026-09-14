import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
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
}

export function SweepShareRow({
	userId,
	username,
	leagueSlug,
	slateKey,
	tweetText,
	shareTitle,
}: Props) {
	const path = sweepPath(username, leagueSlug, slateKey)
	const url = `${SITE_ORIGIN}${path}`
	const props = { userId, league: leagueSlug, slateKey }

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				displayUrl={`${SITE_HOST}${path}`}
				shareTitle={shareTitle}
				onCopied={() =>
					track("sweep_link_shared", { ...props, method: "clipboard" })
				}
				onNativeShared={() =>
					track("sweep_link_shared", { ...props, method: "native" })
				}
			/>
			<PostOnXLink
				text={tweetText}
				url={url}
				onClick={() => track("sweep_link_shared", { ...props, method: "x" })}
			/>
		</VStack>
	)
}
