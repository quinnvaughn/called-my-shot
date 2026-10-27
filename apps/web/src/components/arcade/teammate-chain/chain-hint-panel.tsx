import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"

// Hints about a mystery teammate of the chain's last player, one who can
// still reach the target: where to look first, then his position and years,
// how he came into the league, and last his initials. Each one counts
// against the result, and the next player added starts a new mystery.
export function ChainHintPanel({
	lastName,
	clues,
	cluesLeft,
	hints,
	disabled,
	onHint,
}: {
	// The player the mystery played with.
	lastName: string
	clues: string[]
	cluesLeft: boolean
	// Hints used this game, every mystery counted.
	hints: number
	disabled: boolean
	onHint: () => void
}) {
	const started = clues.length > 0
	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "3",
				padding: "4",
				borderRadius: "xl",
				border: "1px solid {colors.border.default}",
				bg: "bg.surface",
			})}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
				})}
			>
				<div>
					<span
						className={css({
							display: "block",
							fontWeight: "semibold",
							fontSize: "sm",
						})}
					>
						{started
							? `A mystery teammate of ${lastName}`
							: `Stuck on ${lastName}?`}
					</span>
					<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
						{hints === 0
							? "Each hint is a yellow square in your result and costs a point on your group's week."
							: `${hints} ${hints === 1 ? "hint" : "hints"} used. Each is a yellow square in your result.`}
					</span>
				</div>
				{(!started || cluesLeft) && (
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={onHint}
					>
						{started ? "Another clue" : "Get a hint"}
					</Button>
				)}
			</div>
			{started && (
				<ol
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "1.5",
						paddingLeft: "5",
						listStyle: "decimal",
						fontSize: "sm",
					})}
				>
					{clues.map((clue) => (
						<li key={clue}>{clue}</li>
					))}
				</ol>
			)}
		</div>
	)
}
