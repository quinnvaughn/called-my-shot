import { useState } from "react"
import { FiCheck, FiLink, FiShare } from "react-icons/fi"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { IconButton, iconButtonClass } from "#/components/ui/icon-button"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { useMe } from "#/hooks/use-me"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import { useTagShareUrl } from "#/lib/share-links"
import {
	type SeasonOutcome,
	seasonDateLabel,
	seasonGuessCount,
	seasonResultPath,
} from "./season-result"

// The result's link, whose preview is the squares. "Share result" opens the
// share sheet where there is one and copies the link where there isn't.
export function SeasonShareRow({
	date,
	outcomes,
}: {
	date: string
	outcomes: SeasonOutcome[]
}) {
	// Which button just copied the link, so only that one says so.
	const [copied, setCopied] = useState<"share" | "icon" | null>(null)
	const tagShareUrl = useTagShareUrl("name_that_season")
	const guessCount = seasonGuessCount(outcomes)
	const me = useMe()
	const url = `${SITE_ORIGIN}${seasonResultPath(date, outcomes, me?.username)}`
	const day = seasonDateLabel(date)

	async function copy(from: "share" | "icon") {
		await navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		track("season_result_shared", { date, method: "clipboard", toGroup: false })
		setCopied(from)
		setTimeout(() => setCopied(null), 1200)
	}

	async function share() {
		if ("share" in navigator) {
			try {
				await navigator.share({
					title: `Name That Season · ${day}`,
					url: tagShareUrl(url, "native"),
				})
				track("season_result_shared", {
					date,
					method: "native",
					toGroup: false,
				})
				return
			} catch {
				// Dismissed: copying below still works.
			}
		}
		await copy("share")
	}

	return (
		<HStack gap="2" flexWrap="wrap">
			<Button variant="light" onClick={() => void share()}>
				{copied === "share" ? <FiCheck aria-hidden /> : <FiShare aria-hidden />}
				{copied === "share" ? "Link copied" : "Share result"}
			</Button>
			<IconButton
				label={copied === "icon" ? "Link copied" : "Copy link"}
				onClick={() => void copy("icon")}
			>
				{copied === "icon" ? <FiCheck size={15} /> : <FiLink size={15} />}
			</IconButton>
			<PostOnXLink
				text={
					guessCount === null
						? `Couldn't name ${day}'s season. Can you?`
						: `Named ${day}'s season in ${guessCount}. Can you?`
				}
				url={url}
				campaign="name_that_season"
				onClick={() =>
					track("season_result_shared", { date, method: "x", toGroup: false })
				}
				iconClassName={iconButtonClass}
			/>
		</HStack>
	)
}
