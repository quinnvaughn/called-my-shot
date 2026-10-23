import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { RankItemFace, type RankItemView } from "./rank-item-face"

// The day's Blind Rank, in the game's color: what's ranked, the item up
// next, and the five slots below it.
export function RankCard({
	date,
	league,
	prompt,
	context,
	current,
	children,
}: {
	date: string
	league: string
	prompt: string
	context: string
	// Null once all five are placed.
	current: RankItemView | null
	// The slots.
	children: ReactNode
}) {
	return (
		<section
			aria-label="Blind Rank"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "5",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "rank.default",
				color: "rank.ink",
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					gap: "3",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>Blind Rank</span>
				<span>
					{seasonDateLabel(date)} · {league}
				</span>
			</div>
			<div
				className={css({ display: "flex", flexDirection: "column", gap: "1" })}
			>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", md: "4xl" },
						lineHeight: "1",
					})}
				>
					{prompt}
				</h1>
				<span className={css({ fontSize: "md", fontWeight: "semibold" })}>
					{context}
				</span>
			</div>
			{current && (
				<div
					className={css({
						padding: "4",
						borderRadius: "xl",
						bg: "bg.canvas",
						color: "fg.default",
					})}
				>
					<RankItemFace item={current} size="lg" />
				</div>
			)}
			<ol
				className={css({ display: "flex", flexDirection: "column", gap: "2" })}
			>
				{children}
			</ol>
		</section>
	)
}
