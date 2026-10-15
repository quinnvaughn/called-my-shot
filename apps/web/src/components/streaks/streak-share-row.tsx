import type { StreakMode } from "@called-my-shot/scoring"
import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"
import {
	type StreakFamilyValue,
	streakFamilyParam,
	streakPath,
} from "#/lib/streak-meta"

type Props = {
	userId: string
	// Whose streak the link points at.
	username: string
	leagueSlug: string
	family: StreakFamilyValue
	// Which page this row is sharing, so the link and its og:image match the
	// page the reader is on.
	mode: StreakMode
	// Built by buildStreakTweet, which the caller applies because only it
	// knows whose page this is.
	tweetText: string
	shareTitle: string
	// "icons" for a card footer, where sharing is one thing among several.
	layout?: "full" | "icons"
}

export function StreakShareRow({
	userId,
	username,
	leagueSlug,
	family,
	mode,
	tweetText,
	shareTitle,
	layout = "full",
}: Props) {
	const props = {
		userId,
		league: leagueSlug,
		family: streakFamilyParam(family),
	}

	return (
		<ShareLinkRow
			path={streakPath(username, leagueSlug, family, mode)}
			campaign="streak"
			tweetText={tweetText}
			shareTitle={shareTitle}
			layout={layout}
			onShared={(method) => track("streak_link_shared", { ...props, method })}
		/>
	)
}
