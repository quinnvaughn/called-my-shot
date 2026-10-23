import { css, cva } from "styled-system/css"
import { RankItemFace, type RankItemView } from "./rank-item-face"

const row = cva({
	base: {
		display: "grid",
		gridTemplateColumns: "2.5rem 1fr",
		alignItems: "center",
		gap: "3",
		width: "full",
		minHeight: "14",
		padding: "{spacing.2} {spacing.4}",
		borderRadius: "lg",
		textAlign: "left",
		color: "inherit",
		transition: "background-color 0.15s ease, border-color 0.15s ease",
	},
	variants: {
		state: {
			// Tinted from the card's own ink, like the clue rows.
			placed: {
				backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
				border: "1px solid transparent",
			},
			open: {
				backgroundColor: "transparent",
				border: "1px dashed currentColor",
				cursor: "pointer",
				_hover: {
					backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
				},
				_disabled: { cursor: "not-allowed", opacity: 0.6 },
			},
			selected: {
				backgroundColor: "color-mix(in srgb, currentColor 18%, transparent)",
				border: "2px solid currentColor",
				cursor: "pointer",
			},
		},
	},
})

// One of the five slots while playing: the item placed there, or an open
// slot to put the current item in. Slot 1 is the most.
export function RankSlotRow({
	slot,
	placed,
	selected,
	disabled,
	onSelect,
}: {
	slot: number
	placed: RankItemView | null
	selected: boolean
	disabled: boolean
	onSelect: () => void
}) {
	const number = (
		<span className={css({ textStyle: "label", fontWeight: "bold" })}>
			{slot}
			{slot === 1 ? " ·most" : slot === 5 ? " ·least" : ""}
		</span>
	)
	if (placed) {
		return (
			<li className={row({ state: "placed" })}>
				{number}
				<RankItemFace item={placed} />
			</li>
		)
	}
	return (
		<li>
			<button
				type="button"
				aria-pressed={selected}
				disabled={disabled}
				onClick={onSelect}
				className={row({ state: selected ? "selected" : "open" })}
			>
				{number}
				<span className={css({ fontSize: "sm", opacity: 0.8 })}>
					{selected ? "Here" : "Put it here"}
				</span>
			</button>
		</li>
	)
}
