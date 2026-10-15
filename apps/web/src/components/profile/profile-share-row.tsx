import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"

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
		<ShareLinkRow
			path={`/user/${username}`}
			campaign="profile"
			shareTitle={shareTitle}
			layout="icons"
			onShared={(method) => track("profile_link_shared", { userId, method })}
		/>
	)
}
