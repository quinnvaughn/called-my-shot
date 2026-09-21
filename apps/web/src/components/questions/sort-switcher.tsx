import { FiArrowDown, FiArrowUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { SortDirection } from "#/graphql/generated/graphql"

// A sort that can run either way names what each direction puts first
// ("Newest first" / "Oldest first") - read out as the pill's accessible label,
// since the arrow alone says nothing about which end is which.
export type SortOption<T extends string> = {
	value: T
	label: string
	directions?: { desc: string; asc: string }
}

type Props<T extends string> = {
	sorts: SortOption<T>[]
	active: T
	onChange: (value: T) => void
	// Only meaningful when some option has `directions`. Switching to another
	// sort resets it to DESC, the natural end of every flippable sort here;
	// clicking the already-active flippable sort reverses it.
	direction?: SortDirection
	onDirectionChange?: (direction: SortDirection) => void
}

// The sort-pill row shared by the league feed, the game detail page's question
// list, and the My Calls/My Questions pages - each caller supplies its own
// subset of its own sort enum (the feed offers Closing Soon/Most Called/New; a
// single game's questions all share one locksAt, so that page skips Closing
// Soon entirely; My Calls offers a different enum again, since a call sorts by
// things only a call has). Generic over the enum rather than tied to
// QuestionSortOrder for that last reason.
export function SortSwitcher<T extends string>({
	sorts,
	active,
	onChange,
	direction = "DESC",
	onDirectionChange,
}: Props<T>) {
	function select(option: SortOption<T>) {
		if (option.value === active) {
			if (option.directions && onDirectionChange) {
				onDirectionChange(direction === "DESC" ? "ASC" : "DESC")
			}
			return
		}
		onChange(option.value)
		onDirectionChange?.("DESC")
	}

	return (
		<HStack gap="2" alignItems="center" flexWrap="wrap">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				Sort
			</span>
			{sorts.map((s) => {
				const isActive = active === s.value
				// Only the active pill shows a direction, and only if the caller
				// can actually flip it.
				const directionLabel =
					isActive && s.directions && onDirectionChange
						? s.directions[direction === "DESC" ? "desc" : "asc"]
						: null
				return (
					<button
						key={s.value}
						type="button"
						onClick={() => select(s)}
						aria-pressed={isActive}
						aria-label={
							directionLabel ? `${s.label}, ${directionLabel}` : undefined
						}
						title={directionLabel ?? undefined}
						className={css({
							display: "inline-flex",
							alignItems: "center",
							gap: "1",
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							padding: "{spacing.1.5} {spacing.2.5}",
							borderRadius: "md",
							border: isActive
								? "1px solid {colors.border.emphasized}"
								: "1px solid {colors.border.default}",
							color: isActive ? "fg.default" : "fg.subtle",
							bg: isActive ? "bg.subtle" : "transparent",
							cursor: "pointer",
							transition:
								"color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease",
							_hover: {
								color: "fg.default",
								borderColor: "border.emphasized",
							},
						})}
					>
						{s.label}
						{directionLabel &&
							(direction === "DESC" ? (
								<FiArrowDown aria-hidden />
							) : (
								<FiArrowUp aria-hidden />
							))}
					</button>
				)
			})}
		</HStack>
	)
}
