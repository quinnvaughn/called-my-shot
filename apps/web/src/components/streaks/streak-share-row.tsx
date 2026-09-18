import type { StreakMode } from "@called-my-shot/scoring"
import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
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
}

export function StreakShareRow({
	userId,
	username,
	leagueSlug,
	family,
	mode,
	tweetText,
	shareTitle,
}: Props) {
	const path = streakPath(username, leagueSlug, family, mode)
	const url = `${SITE_ORIGIN}${path}`
	const props = {
		userId,
		league: leagueSlug,
		family: streakFamilyParam(family),
	}

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				displayUrl={`${SITE_HOST}${path}`}
				shareTitle={shareTitle}
				onCopied={() =>
					track("streak_link_shared", { ...props, method: "clipboard" })
				}
				onNativeShared={() =>
					track("streak_link_shared", { ...props, method: "native" })
				}
			/>
			<PostOnXLink
				text={tweetText}
				url={url}
				onClick={() => track("streak_link_shared", { ...props, method: "x" })}
			/>
		</VStack>
	)
}
