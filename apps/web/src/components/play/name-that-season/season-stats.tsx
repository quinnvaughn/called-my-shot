import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import { viewerSeasonPuzzleStatsQuery } from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"
import { SeasonDistributionRow } from "./season-distribution-row"
import { SeasonStat } from "./season-stat"

// The player's Name That Season record: streaks, how often they get it, and
// how many guesses it usually takes. `todayGuessCount` lights up today's bar.
export function SeasonStats({
	todayGuessCount,
}: {
	todayGuessCount?: number | null
}) {
	const me = useMe()
	const { data } = useQuery({ ...viewerSeasonPuzzleStatsQuery, enabled: !!me })
	const stats = data?.viewerSeasonPuzzleStats

	// Signed out, the result's sign-up step makes the case for stats.
	if (!me || !stats) return null

	const max = Math.max(...stats.distribution, 0)
	const solvedPct =
		stats.played > 0
			? `${Math.round((stats.solved / stats.played) * 100)}%`
			: "–"

	return (
		<Card>
			<Card.Body>
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "4",
					})}
				>
					<SectionLabel>Your stats</SectionLabel>
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: {
								base: "repeat(2, minmax(0, 1fr))",
								md: "repeat(4, minmax(0, 1fr))",
							},
							gap: "4",
						})}
					>
						<SeasonStat
							value={String(stats.currentStreak)}
							label="Current streak"
						/>
						<SeasonStat value={String(stats.bestStreak)} label="Best streak" />
						<SeasonStat value={String(stats.played)} label="Played" />
						<SeasonStat value={solvedPct} label="Named" />
					</div>
					<div
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "1.5",
						})}
					>
						<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
							Guesses it took
						</span>
						{stats.distribution.map((count, i) => (
							<SeasonDistributionRow
								// biome-ignore lint/suspicious/noArrayIndexKey: one bar per guess count, fixed order
								key={i}
								label={String(i + 1)}
								count={count}
								max={max}
								highlight={todayGuessCount === i + 1}
							/>
						))}
						<SeasonDistributionRow
							label="X"
							count={stats.missed}
							max={Math.max(max, stats.missed)}
							highlight={todayGuessCount === null}
						/>
					</div>
				</div>
			</Card.Body>
		</Card>
	)
}
