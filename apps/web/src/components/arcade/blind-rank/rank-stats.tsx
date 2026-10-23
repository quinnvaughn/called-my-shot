import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { SeasonDistributionRow } from "#/components/arcade/name-that-season/season-distribution-row"
import { SeasonStat } from "#/components/arcade/name-that-season/season-stat"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import { viewerRankStatsQuery } from "#/graphql/blind-rank/queries"
import { useMe } from "#/hooks/use-me"
import { RANK_SLOTS } from "./rank-result"

// The player's Blind Rank record: streaks, perfect games, and how many they
// usually get right. `todayCorrect` lights up today's bar. Signed out, the
// result's sign-up step makes the case for stats instead.
export function RankStats({ todayCorrect }: { todayCorrect?: number | null }) {
	const me = useMe()
	const { data } = useQuery({ ...viewerRankStatsQuery, enabled: !!me })
	const stats = data?.viewerRankStats
	if (!me || !stats) return null

	const max = Math.max(...stats.distribution, 0)
	// Four right can't happen, so its bar never shows.
	const counts = [5, 3, 2, 1, 0]

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
						<SeasonStat value={String(stats.perfect)} label="Perfect" />
					</div>
					<div
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "1.5",
						})}
					>
						<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
							Right of {RANK_SLOTS}
						</span>
						{counts.map((n) => (
							<SeasonDistributionRow
								key={n}
								label={String(n)}
								count={stats.distribution[n] ?? 0}
								max={max}
								highlight={todayCorrect === n}
							/>
						))}
					</div>
				</div>
			</Card.Body>
		</Card>
	)
}
