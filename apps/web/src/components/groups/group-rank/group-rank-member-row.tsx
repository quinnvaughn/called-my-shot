import { css } from "styled-system/css"
import { GuessSquares } from "#/components/arcade/name-that-season/guess-squares"
import { Identity } from "#/components/ui/identity"

// One member on the group's Blind Rank board for the day: who, which slots
// they got right, and how many.
export function GroupRankMemberRow({
	row,
}: {
	row: {
		status: "DONE" | "PLAYING" | "NOT_PLAYED"
		squares: boolean[]
		correctCount?: number | null
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
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<Identity
				name={row.user.name}
				username={row.user.username}
				avatarUrl={row.user.avatarUrl ?? null}
			/>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: "1",
					flexShrink: 0,
				})}
			>
				{row.status === "DONE" && (
					<GuessSquares
						size="sm"
						squares={row.squares.map((right) => (right ? "hit" : "miss"))}
					/>
				)}
				<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
					{row.status === "DONE"
						? `${row.correctCount ?? 0} of 5`
						: row.status === "PLAYING"
							? "Still playing"
							: "Not played yet"}
				</span>
			</div>
		</div>
	)
}
