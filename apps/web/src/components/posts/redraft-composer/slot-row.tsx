import { FiArrowDown, FiArrowUp, FiX } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import type { DraftSlotData, RedraftPoolEntry } from "./types"

type Props = {
	slot: DraftSlotData
	pick: RedraftPoolEntry | null
	// Where the next pick goes.
	active: boolean
	onActivate: () => void
	// Null where there's nowhere to move it (the first slot can't go up).
	onMoveUp: (() => void) | null
	onMoveDown: (() => void) | null
	onRemove: () => void
}

const iconButton = css({
	display: "grid",
	placeItems: "center",
	width: "8",
	height: "8",
	borderRadius: "md",
	color: "fg.muted",
	cursor: "pointer",
	_hover: { bg: "bg.subtle", color: "fg.default" },
	_disabled: { opacity: 0.3, cursor: "default", _hover: { bg: "transparent" } },
})

// One slot on the composer's board: the pick number, the team that held it
// with who it really took, and the player put there now (with moving and
// removing), or the empty spot the next pick goes in.
export function SlotRow({
	slot,
	pick,
	active,
	onActivate,
	onMoveUp,
	onMoveDown,
	onRemove,
}: Props) {
	return (
		<li
			className={cx(
				css({
					display: "flex",
					alignItems: "center",
					gap: "3",
					padding: "{spacing.2} {spacing.3}",
					borderRadius: "lg",
					border: "1px solid {colors.border.default}",
					bg: "bg.surface",
				}),
				active && css({ border: "1px solid {colors.secondary.default}" }),
			)}
		>
			<span
				className={css({
					width: "7",
					flexShrink: 0,
					textAlign: "right",
					fontFamily: "heading",
					fontSize: "lg",
				})}
			>
				{slot.slot}
			</span>
			<span className={css({ display: "flex", width: "7", flexShrink: 0 })}>
				{slot.team?.logoUrl && (
					<img
						src={slot.team.logoUrl}
						alt=""
						loading="lazy"
						className={css({
							width: "7",
							height: "7",
							objectFit: "contain",
						})}
					/>
				)}
			</span>
			<VStack gap="0.5" alignItems="stretch" flex="1" minWidth="0">
				<span
					className={css({
						textStyle: "meta",
						color: "fg.muted",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					})}
				>
					{slot.teamName ?? "Pick"} took {slot.playerName}
				</span>
				{pick ? (
					<HStack gap="2" minWidth="0">
						<PlayerHeadshot
							name={pick.player.name}
							src={pick.player.headshotUrl}
						/>
						<span
							className={css({
								fontWeight: "semibold",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							})}
						>
							{pick.player.name}
						</span>
					</HStack>
				) : (
					<button
						type="button"
						onClick={onActivate}
						className={css({
							alignSelf: "flex-start",
							fontSize: "sm",
							color: active ? "secondary.default" : "fg.subtle",
							cursor: "pointer",
							_hover: { textDecoration: "underline" },
						})}
					>
						{active ? "Your next pick goes here" : "Pick here next"}
					</button>
				)}
			</VStack>
			{pick && (
				<HStack gap="0.5" flexShrink={0}>
					<button
						type="button"
						aria-label={`Move ${pick.player.name} up to #${slot.slot - 1}`}
						disabled={!onMoveUp}
						onClick={() => onMoveUp?.()}
						className={iconButton}
					>
						<FiArrowUp size={14} />
					</button>
					<button
						type="button"
						aria-label={`Move ${pick.player.name} down to #${slot.slot + 1}`}
						disabled={!onMoveDown}
						onClick={() => onMoveDown?.()}
						className={iconButton}
					>
						<FiArrowDown size={14} />
					</button>
					<button
						type="button"
						aria-label={`Remove ${pick.player.name}`}
						onClick={onRemove}
						className={iconButton}
					>
						<FiX size={14} />
					</button>
				</HStack>
			)}
		</li>
	)
}
