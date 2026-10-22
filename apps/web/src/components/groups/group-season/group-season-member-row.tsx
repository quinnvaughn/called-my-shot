import { css } from "styled-system/css"
import { GuessSquares } from "#/components/play/name-that-season/guess-squares"
import {
	type SeasonOutcome,
	seasonSquares,
} from "#/components/play/name-that-season/season-result"
import { Identity } from "#/components/ui/identity"
import {
	type SeasonBoardStatus,
	seasonPuzzleBoardResult,
} from "./season-board-squares"

// One member on the group's board for the day: who, their squares, and how
// it went.
export function GroupSeasonMemberRow({
	row,
}: {
	row: {
		status: SeasonBoardStatus
		squares: SeasonOutcome[]
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
				<GuessSquares size="sm" squares={seasonSquares(row.squares)} />
				<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
					{seasonPuzzleBoardResult(row.status, row.squares)}
				</span>
			</div>
		</div>
	)
}
