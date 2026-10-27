import { css } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"

// One team on a player's row, with the years he was there. A franchise
// under an old name ("Seattle SuperSonics") says that name, since today's
// abbreviation would point at a team he never played for.
export function ChainPlayerTeam({
	entry,
}: {
	entry: {
		name: string
		years: string
		team: {
			name: string
			abbreviation: string
			color: string
			logoUrl?: string | null
		}
	}
}) {
	const label =
		entry.name === entry.team.name ? entry.team.abbreviation : entry.name
	return (
		<li
			className={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "1.5",
				fontSize: "xs",
				color: "fg.muted",
				whiteSpace: "nowrap",
			})}
		>
			<TeamBadge
				abbreviation={entry.team.abbreviation}
				color={entry.team.color}
				logoUrl={entry.team.logoUrl}
			/>
			<span>
				<span className={css({ color: "fg.default", fontWeight: "medium" })}>
					{label}
				</span>{" "}
				{entry.years}
			</span>
		</li>
	)
}
