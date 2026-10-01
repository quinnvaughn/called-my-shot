import { ShareIconRow } from "#/components/ui/share-icon-row"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"

type Props = {
	userId: string
	username: string
	shareTitle: string
}

// The thing being shared is the profile url - its og:image is the career
// results calendar, so the link unfurls with the grid the page leads with.
// Copy and the native share sheet only: a profile gets sent to someone, not
// posted to X the way a call or a report card is.
export function ProfileShareRow({ userId, username, shareTitle }: Props) {
	return (
		<ShareIconRow
			url={`${SITE_ORIGIN}/user/${username}`}
			shareTitle={shareTitle}
			onShared={(method) => track("profile_link_shared", { userId, method })}
		/>
	)
}
