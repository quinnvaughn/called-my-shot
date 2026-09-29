import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"

type Props = {
	userId: string
	username: string
	// Built by buildProfileTweet, which the caller applies because only it
	// knows whose profile this is.
	tweetText: string
	shareTitle: string
}

// Mirrors ReportCardShareRow. The thing being shared is the profile url - its
// og:image is the results calendar, so the link unfurls with the same grid
// the page leads with.
export function ProfileShareRow({
	userId,
	username,
	tweetText,
	shareTitle,
}: Props) {
	const path = `/user/${username}`
	const url = `${SITE_ORIGIN}${path}`

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				displayUrl={`${SITE_HOST}${path}`}
				shareTitle={shareTitle}
				onCopied={() =>
					track("profile_link_shared", { userId, method: "clipboard" })
				}
				onNativeShared={() =>
					track("profile_link_shared", { userId, method: "native" })
				}
			/>
			<PostOnXLink
				text={tweetText}
				url={url}
				onClick={() => track("profile_link_shared", { userId, method: "x" })}
			/>
		</VStack>
	)
}
