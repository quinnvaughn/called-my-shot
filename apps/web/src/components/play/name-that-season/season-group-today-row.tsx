import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiCheck, FiChevronRight, FiSend } from "react-icons/fi"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { GroupLogo } from "#/components/ui/group-logo"
import { track } from "#/lib/analytics"
import { pluralize } from "#/lib/pluralize"
import { useTagShareUrl } from "#/lib/share-links"

// One of the player's groups: how many members have played today, a button
// that sends the result there with the player's invite on it (so whoever
// opens it in that chat can play, then join), and the group's scoreboard
// behind the rest of the row.
export function SeasonGroupTodayRow({
	group,
	date,
	resultUrl,
}: {
	group: {
		id: string
		name: string
		logoUrl?: string | null
		myInvite?: { code: string } | null
		seasonPuzzleBoard: { today: { status: string }[] } | null
	}
	date: string
	resultUrl: string
}) {
	const [copied, setCopied] = useState(false)
	const tagShareUrl = useTagShareUrl("name_that_season")
	const members = group.seasonPuzzleBoard?.today ?? []
	const played = members.filter((m) => m.status !== "NOT_PLAYED").length
	const invite = group.myInvite?.code

	async function send() {
		if (!invite) return
		const withInvite = new URL(resultUrl)
		withInvite.searchParams.set("invite", invite)
		const url = withInvite.toString()
		if ("share" in navigator) {
			try {
				await navigator.share({
					title: `Name That Season · ${group.name}`,
					url: tagShareUrl(url, "native"),
				})
				track("season_result_shared", { date, method: "native", toGroup: true })
				return
			} catch {
				// Dismissed: copying below still works.
			}
		}
		await navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		track("season_result_shared", { date, method: "clipboard", toGroup: true })
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
				to="/groups/$groupId/daily"
				params={{ groupId: group.id }}
				onClick={() =>
					track("season_next_step_clicked", { step: "group_board" })
				}
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
						{played} of {members.length} {pluralize(members.length, "member")}{" "}
						played today
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
				to="/groups/$groupId/daily"
				params={{ groupId: group.id }}
				aria-label={`Open ${group.name}`}
				className={css({ display: "flex", color: "fg.subtle" })}
			>
				<FiChevronRight size={16} />
			</Link>
		</div>
	)
}
