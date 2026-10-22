import { css } from "styled-system/css"

// One clue on the season card: earned and showing, or still locked behind a
// wrong guess.
export function ClueRow({
	number,
	text,
	fresh = false,
}: {
	number: number
	// Null while locked.
	text: string | null
	// The clue the last wrong guess just revealed.
	fresh?: boolean
}) {
	return (
		<li
			className={css({
				display: "grid",
				gridTemplateColumns: "auto 1fr",
				alignItems: "baseline",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				borderRadius: "lg",
				// Tinted from the card's own ink.
				backgroundColor:
					text === null
						? "transparent"
						: "color-mix(in srgb, currentColor 12%, transparent)",
				border:
					text === null
						? "1px dashed currentColor"
						: fresh
							? "1px solid currentColor"
							: "1px solid transparent",
				opacity: text === null ? 0.55 : 1,
				animation: fresh ? "toastIn 0.3s ease" : undefined,
			})}
		>
			<span
				className={css({
					textStyle: "label",
					fontWeight: "bold",
					minWidth: "5",
				})}
			>
				{number}
			</span>
			<span
				className={css({
					fontSize: text === null ? "sm" : "md",
					fontWeight: text === null ? "normal" : "medium",
					lineHeight: "snug",
				})}
			>
				{text ?? "Revealed after a wrong guess"}
			</span>
		</li>
	)
}
