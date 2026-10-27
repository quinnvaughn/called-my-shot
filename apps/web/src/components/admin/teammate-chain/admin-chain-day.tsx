import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Tag } from "#/components/ui/tag"
import type {
	TeammateChainPlayer_PlayerFragment,
	TeammateChainPuzzle_PuzzleFragment,
} from "#/graphql/generated/graphql"
import { AdminChainDayEditor } from "./admin-chain-day-editor"

// One day of the Teammate Chain schedule: the pair, par and a par route, or
// a gap, an unsaved practice game behind "Play", and the overrides behind
// "Change".
export function AdminChainDay({
	date,
	isToday,
	day,
	leagues,
	otherDates,
}: {
	date: string
	isToday: boolean
	day: {
		played: number
		puzzle: TeammateChainPuzzle_PuzzleFragment
		parRoute: TeammateChainPlayer_PlayerFragment[]
	} | null
	leagues: { id: string; abbreviation: string }[]
	otherDates: { date: string; label: string }[]
}) {
	const [open, setOpen] = useState(false)
	const puzzle = day?.puzzle
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
				{day && puzzle ? (
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
								{puzzle.start.player.name} to {puzzle.target.player.name}
							</span>
							<Tag size="sm">{puzzle.league.abbreviation}</Tag>
							<Tag size="sm">{`Par ${puzzle.par}`}</Tag>
							{day.played > 0 && (
								<Tag size="sm" variant="secondary">
									{`${day.played} played`}
								</Tag>
							)}
						</span>
						<span className={css({ fontSize: "xs", color: "fg.muted" })}>
							Via {day.parRoute.map((p) => p.player.name).join(", ")}
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
							to="/arcade/teammate-chain"
							search={{ practice: date }}
							className={css({ textStyle: "label", color: "fg.muted" })}
						>
							Play
						</Link>
					)}
					{!isToday && (
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
					)}
				</span>
			</div>
			{open && (
				<AdminChainDayEditor
					key={puzzle?.id ?? date}
					date={date}
					leagueId={puzzle?.league.id ?? null}
					scheduled={!!puzzle}
					leagues={leagues}
					otherDates={otherDates}
				/>
			)}
		</div>
	)
}
