import { css } from "styled-system/css"
import { Identity } from "#/components/ui/identity"
import { pluralize } from "#/lib/pluralize"

// One member's week across the arcade games: points and games finished.
export function GroupArcadeWeekRow({
	rank,
	row,
}: {
	rank: number
	row: {
		points: number
		played: number
		user: {
			id: string
			username: string
			name: string
			avatarUrl?: string | null
		}
	}
}) {
	return (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: "1.5rem 1fr auto",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<span className={css({ textStyle: "metaLg", color: "fg.muted" })}>
				{rank}
			</span>
			<Identity
				name={row.user.name}
				username={row.user.username}
				avatarUrl={row.user.avatarUrl ?? null}
			/>
			<span className={css({ textAlign: "right" })}>
				<span
					className={css({
						display: "block",
						fontFamily: "heading",
						fontSize: "lg",
					})}
				>
					{row.points} {pluralize(row.points, "pt")}
				</span>
				<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
					{row.played} {pluralize(row.played, "game")} played
				</span>
			</span>
		</div>
	)
}
