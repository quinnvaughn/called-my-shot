import { chainDurationLabel } from "@called-my-shot/schemas"
import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { SeasonStat } from "#/components/arcade/name-that-season/season-stat"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import { viewerTeammateChainStatsQuery } from "#/graphql/teammate-chain/queries"
import { useMe } from "#/hooks/use-me"

// The player's Teammate Chain record: streaks, how often they hit par, how
// far over it they usually land, and their fastest solve. Signed out, the
// result's sign-up step makes the case for stats instead.
export function ChainStats() {
	const me = useMe()
	const { data } = useQuery({ ...viewerTeammateChainStatsQuery, enabled: !!me })
	const stats = data?.viewerTeammateChainStats
	if (!me || !stats) return null

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
								md: "repeat(3, minmax(0, 1fr))",
							},
							gap: "4",
						})}
					>
						<SeasonStat
							value={String(stats.currentStreak)}
							label="Current streak"
						/>
						<SeasonStat value={String(stats.bestStreak)} label="Best streak" />
						<SeasonStat value={String(stats.solved)} label="Solved" />
						<SeasonStat value={String(stats.atPar)} label="At par" />
						<SeasonStat
							value={
								stats.averageOverPar === null
									? "None yet"
									: stats.averageOverPar.toFixed(1)
							}
							label="Links over par, on average"
						/>
						<SeasonStat
							value={
								stats.bestSeconds === null
									? "None yet"
									: chainDurationLabel(stats.bestSeconds)
							}
							label="Fastest solve"
						/>
					</div>
				</div>
			</Card.Body>
		</Card>
	)
}
