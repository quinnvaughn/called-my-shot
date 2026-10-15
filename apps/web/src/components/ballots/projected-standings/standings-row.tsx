import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { TeamBadge } from "#/components/ui/team-badge"
import {
	changeNote,
	type StandingsRow as StandingsRowData,
	statusLabel,
} from "#/lib/projected-standings"
import { AdjustButtons } from "./adjust-buttons"
import { MoveButton } from "./move-button"
import { TeamLink } from "./team-link"
import type { Adjust, MoveHandlers } from "./types"

export function StandingsRow({
	row,
	showLosses,
	moves,
	adjust,
}: {
	row: StandingsRowData
	showLosses: boolean
	moves: MoveHandlers
	adjust: Adjust | null
}) {
	const picked = row.wins !== null
	const detail = [
		statusLabel(row),
		changeNote(row, adjust),
		row.team.conviction === null ? null : `${row.team.conviction}% conviction`,
	]
		.filter((part) => part !== null)
		.join(" · ")
	const movable = moves.up !== null || moves.down !== null
	return (
		<HStack
			gap="3"
			alignItems="center"
			paddingInline="3"
			paddingBlock="2.5"
			className={css({
				borderBottom: "1px solid {colors.border.default}",
				_last: { borderBottom: "none" },
			})}
		>
			<span
				className={css({
					textStyle: "metaLg",
					color: "fg.subtle",
					width: "5",
					flexShrink: "0",
				})}
			>
				{row.rank ?? ""}
			</span>
			<TeamLink team={row.team}>
				<TeamBadge
					abbreviation={row.team.abbreviation}
					color={row.team.color}
					logoUrl={row.team.logoUrl}
				/>
				<VStack gap="0" alignItems="flex-start" flex="1" minWidth="0">
					<span
						className={css({
							fontSize: "sm",
							fontWeight: "medium",
							color: picked ? "fg.default" : "fg.subtle",
							truncate: true,
							width: "full",
						})}
					>
						{row.team.name}
					</span>
					{detail && (
						<span
							className={css({
								textStyle: "labelSm",
								color: "fg.subtle",
							})}
						>
							{detail}
						</span>
					)}
				</VStack>
			</TeamLink>
			{adjust && <AdjustButtons name={row.team.name} adjust={adjust} />}
			{movable && (
				<VStack gap="0.5" flexShrink="0">
					<MoveButton label={`Move ${row.team.name} up`} onClick={moves.up}>
						<FiChevronUp />
					</MoveButton>
					<MoveButton label={`Move ${row.team.name} down`} onClick={moves.down}>
						<FiChevronDown />
					</MoveButton>
				</VStack>
			)}
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "sm",
					fontWeight: "bold",
					color: picked ? "fg.default" : "fg.subtle",
					flexShrink: "0",
				})}
			>
				{match(row)
					.with({ wins: null }, () => "No pick")
					.otherwise(({ wins, losses }) =>
						showLosses ? `${wins}-${losses}` : `${wins} W`,
					)}
			</span>
			<span
				className={css({
					textStyle: "meta",
					fontWeight: "bold",
					color: "secondary.default",
					width: "8",
					textAlign: "right",
					flexShrink: "0",
				})}
			>
				{row.seed ?? ""}
			</span>
		</HStack>
	)
}
