import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiCheck, FiChevronRight, FiSend } from "react-icons/fi"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { GroupLogo } from "#/components/ui/group-logo"
import { pluralize } from "#/lib/pluralize"
import { type ShareMethod, useTagShareUrl } from "#/lib/share-links"
import { ARCADE_GAME_INFO, type ArcadeGameKey } from "./arcade-game-info"

// One of the player's groups under a finished arcade game: how many members
// have played it today, a button that sends the result there with the
// player's invite on it (so whoever opens it in that chat can play, then
// join), and the group's Arcade tab behind the rest of the row.
export function ArcadeGroupRow({
	game,
	group,
	played,
	members,
	resultUrl,
	onShared,
	onOpened,
}: {
	game: ArcadeGameKey
	group: {
		id: string
		name: string
		logoUrl?: string | null
		myInvite?: { code: string } | null
	}
	played: number
	members: number
	resultUrl: string
	onShared: (method: ShareMethod) => void
	onOpened: () => void
}) {
	const [copied, setCopied] = useState(false)
	const tagShareUrl = useTagShareUrl(ARCADE_GAME_INFO[game].campaign)
	const invite = group.myInvite?.code

	async function send() {
		if (!invite) return
		const withInvite = new URL(resultUrl)
		withInvite.searchParams.set("invite", invite)
		const url = withInvite.toString()
		if ("share" in navigator) {
			try {
				await navigator.share({
					title: `${ARCADE_GAME_INFO[game].name} · ${group.name}`,
					url: tagShareUrl(url, "native"),
				})
				onShared("native")
				return
			} catch {
				// Dismissed: copying below still works.
			}
		}
		await navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		onShared("clipboard")
		setCopied(true)
		setTimeout(() => setCopied(false), 1200)
	}

	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<Link
				to="/groups/$groupId/arcade"
				params={{ groupId: group.id }}
				onClick={onOpened}
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "3",
					flex: 1,
					minWidth: 0,
					color: "fg.default",
				})}
			>
				<GroupLogo name={group.name} src={group.logoUrl} size="sm" />
				<span className={css({ flex: 1, minWidth: 0 })}>
					<span
						className={css({
							display: "block",
							fontSize: "sm",
							fontWeight: "medium",
							truncate: true,
						})}
					>
						{group.name}
					</span>
					<span className={css({ textStyle: "label", color: "fg.muted" })}>
						{played} of {members} {pluralize(members, "member")} played{" "}
						{game === "watch" ? "this quiz" : "today"}
					</span>
				</span>
			</Link>
			{invite && (
				<Button variant="outline" size="sm" onClick={() => void send()}>
					{copied ? <FiCheck aria-hidden /> : <FiSend aria-hidden />}
					{copied ? "Link copied" : "Send"}
				</Button>
			)}
			<Link
				to="/groups/$groupId/arcade"
				params={{ groupId: group.id }}
				aria-label={`Open ${group.name}`}
				className={css({ display: "flex", color: "fg.subtle" })}
			>
				<FiChevronRight size={16} />
			</Link>
		</div>
	)
}
