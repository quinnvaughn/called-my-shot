import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Tag } from "#/components/ui/tag"
import type { RankPuzzleAdmin_PuzzleFragment } from "#/graphql/generated/graphql"
import { AdminRankDayEditor } from "./admin-rank-day-editor"

// One day of the Blind Rank schedule: what's ranked and the true order, or
// a gap, an unsaved practice game behind "Play", and the overrides behind
// "Change".
export function AdminRankDay({
	date,
	isToday,
	puzzle,
	leagues,
	otherDates,
}: {
	date: string
	isToday: boolean
	puzzle: RankPuzzleAdmin_PuzzleFragment | null
	leagues: { id: string; abbreviation: string }[]
	otherDates: { date: string; label: string }[]
}) {
	const [open, setOpen] = useState(false)
	return (
		<div
			className={css({
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: "6rem 1fr auto",
					alignItems: "start",
					gap: "3",
					padding: "{spacing.2.5} {spacing.4}",
				})}
			>
				<span className={css({ textStyle: "metaLg" })}>
					{seasonDateLabel(date)}
					{isToday && " · today"}
				</span>
				{puzzle ? (
					<span
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "1",
						})}
					>
						<span
							className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}
						>
							<span className={css({ fontWeight: "semibold" })}>
								{puzzle.prompt} · {puzzle.context}
							</span>
							<Tag size="sm">{puzzle.league.abbreviation}</Tag>
							{puzzle.played > 0 && (
								<Tag size="sm" variant="secondary">
									{`${puzzle.played} played`}
								</Tag>
							)}
						</span>
						<span className={css({ fontSize: "xs", color: "fg.muted" })}>
							{puzzle.order.map((o) => `${o.label} (${o.display})`).join(" · ")}
						</span>
					</span>
				) : (
					<Tag size="sm" variant="danger">
						Nothing scheduled
					</Tag>
				)}
				<span className={css({ display: "flex", gap: "3" })}>
					{puzzle && (
						<Link
							to="/arcade/blind-rank"
							search={{ practice: date }}
							className={css({ textStyle: "label", color: "fg.muted" })}
						>
							Play
						</Link>
					)}
					<button
						type="button"
						onClick={() => setOpen(!open)}
						className={css({
							textStyle: "label",
							color: "fg.muted",
							cursor: "pointer",
						})}
					>
						{open ? "Close" : "Change"}
					</button>
				</span>
			</div>
			{open && (
				<AdminRankDayEditor
					key={puzzle?.id ?? date}
					date={date}
					isToday={isToday}
					puzzle={
						puzzle
							? {
									prompt: puzzle.prompt,
									context: puzzle.context,
									leagueId: puzzle.league.id,
								}
							: null
					}
					leagues={leagues}
					otherDates={otherDates}
				/>
			)}
		</div>
	)
}
