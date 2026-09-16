import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

type Props<T extends string> = {
	sorts: { value: T; label: string }[]
	active: T
	onChange: (value: T) => void
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
}: Props<T>) {
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
				return (
					<button
						key={s.value}
						type="button"
						onClick={() => onChange(s.value)}
						className={css({
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
					</button>
				)
			})}
		</HStack>
	)
}
