import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import type { SeasonPuzzleAdmin_PuzzleFragment } from "#/graphql/generated/graphql"
import { AdminSeasonDayEditor } from "./admin-season-day-editor"

// One day of the schedule: the season running then, or a gap, an unsaved
// practice game behind "Play", and the overrides for it behind "Change".
export function AdminSeasonDay({
	date,
	isToday,
	puzzle,
	leagues,
	otherDates,
}: {
	date: string
	isToday: boolean
	puzzle: SeasonPuzzleAdmin_PuzzleFragment | null
	leagues: { id: string; abbreviation: string }[]
	otherDates: { date: string; label: string }[]
}) {
	const [open, setOpen] = useState(false)
	const league = puzzle
		? leagues.find((l) => l.id === puzzle.answer.team.league.id)
		: null
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
					alignItems: "center",
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
							alignItems: "center",
							gap: "2",
							flexWrap: "wrap",
						})}
					>
						<TeamBadge
							abbreviation={puzzle.answer.team.abbreviation}
							color={puzzle.answer.team.color}
							logoUrl={puzzle.answer.team.logoUrl}
						/>
						{puzzle.answer.label} {puzzle.answer.name}
						{league && <Tag size="sm">{league.abbreviation}</Tag>}
						{puzzle.played > 0 && (
							<Tag size="sm" variant="secondary">
								{`${puzzle.played} played`}
							</Tag>
						)}
					</span>
				) : (
					<Tag size="sm" variant="danger">
						Nothing scheduled
					</Tag>
				)}
				<span className={css({ display: "flex", gap: "3" })}>
					{puzzle && (
						<Link
							to="/arcade/name-that-season"
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
				<AdminSeasonDayEditor
					key={puzzle?.id ?? date}
					date={date}
					isToday={isToday}
					puzzle={
						puzzle && league
							? { clues: puzzle.clues, leagueId: league.id }
							: null
					}
					leagues={leagues}
					otherDates={otherDates}
				/>
			)}
		</div>
	)
}
