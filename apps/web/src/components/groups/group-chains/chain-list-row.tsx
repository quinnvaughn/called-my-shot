import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { ChainListRow_ChainFragment } from "#/graphql/generated/graphql"
import { multiplierLabel } from "#/lib/chains"
import { formatShortDate } from "#/lib/format-date"
import { ChainPhaseTag } from "./chain-phase-tag"

export type ChainListItem = ChainListRow_ChainFragment

// One chain in the group's list: where it stands, whose links are in it, and
// the viewer's multiplier if they're one of them.
export function ChainListRow({
	groupId,
	chain,
}: {
	groupId: string
	chain: ChainListItem
}) {
	const names = chain.links.map(
		(link) => `@${link.user?.username ?? "someone"}`,
	)
	const summary =
		chain.phase === "BROKEN" && chain.breaker
			? `@${chain.breaker.user?.username ?? "someone"} broke it`
			: chain.phase === "OPEN" && chain.locksAt
				? `Locks ${formatShortDate(chain.locksAt)}`
				: null
	return (
		<Link
			to="/groups/$groupId/chains/$chainId"
			params={{ groupId, chainId: chain.id }}
			className={css({
				display: "block",
				padding: "4",
				borderRadius: "xl",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				transition: "border-color 0.15s ease",
				_hover: { border: "1px solid {colors.border.emphasized}" },
			})}
		>
			<VStack gap="2" alignItems="stretch">
				<HStack justify="space-between" gap="3">
					<span className={css({ fontSize: "md", fontWeight: "semibold" })}>
						{chain.links.length === 1
							? "1 link"
							: `${chain.links.length} links`}
						{chain.starter ? ` · started by @${chain.starter.username}` : ""}
					</span>
					<ChainPhaseTag phase={chain.phase} />
				</HStack>
				<span className={css({ fontSize: "sm", color: "fg.muted" })}>
					{names.join(", ")}
				</span>
				<HStack gap="3" justify="space-between" flexWrap="wrap">
					{summary && (
						<span className={css({ textStyle: "meta", color: "fg.muted" })}>
							{summary}
						</span>
					)}
					{chain.viewerLink?.status === "APPROVED" && (
						<span
							className={css({
								textStyle: "meta",
								color: "secondary.default",
							})}
						>
							You're in at {multiplierLabel(chain.viewerLink.multiplier)}
						</span>
					)}
					{chain.viewerLink?.status === "REQUESTED" && (
						<span className={css({ textStyle: "meta", color: "fg.muted" })}>
							Your link is waiting on a yes
						</span>
					)}
				</HStack>
			</VStack>
		</Link>
	)
}
