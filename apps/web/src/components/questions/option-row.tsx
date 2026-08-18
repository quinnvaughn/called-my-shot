import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

type Props = {
	label: string
	fieldPct: number | null
	// Omitted entirely by callers that don't have it (e.g.
	// ResolveQuestionModal, which shows the option pool with no live stats) -
	// the count segment just doesn't render rather than showing a "0".
	count?: number
	selected: boolean
	// Omitted by callers rendering a static field breakdown (nothing left to
	// pick) - renders as a plain non-interactive row instead of a button, at
	// full opacity rather than a dimmed "disabled" look, since there's
	// nothing actually unavailable about it.
	onClick?: () => void
}

const compactCount = new Intl.NumberFormat("en-US", { notation: "compact" })

// A question's own option pool, rendered as a full-width selectable row with
// a live fieldPct fill bar - the pool is fixed to this question's existing
// questionOptions, not an open catalog, so unlike SubjectPicker/
// EntitySearchField this needs no search, just a pick. ChipButton (used
// elsewhere for quick-pick pills) doesn't have room for a trailing
// percentage or a fill bar, hence a dedicated component here.
export function OptionRow({
	label,
	fieldPct,
	count,
	selected,
	onClick,
}: Props) {
	const rowClassName = css({
		position: "relative",
		width: "full",
		textAlign: "left",
		background: "card",
		border: "1px solid",
		borderColor: selected ? "primary.default" : "border.default",
		borderRadius: "md",
		padding: "3",
		overflow: "hidden",
		cursor: onClick ? "pointer" : "default",
		// Selected already owns the border color - a hover rule with no
		// selected guard wins on source order regardless of specificity,
		// so it was silently overriding primary.default back to
		// border.emphasized on any selected row the pointer sat over.
		_hover:
			!onClick || selected ? {} : { borderColor: "border.emphasized" },
	})

	const content = (
		<>
			{fieldPct !== null && (
				<div
					className={css({
						position: "absolute",
						inset: "0",
						backgroundColor: selected
							? "primary.default/18"
							: "primary.default/10",
						zIndex: 0,
						transition: "background-color 0.15s ease",
					})}
					style={{ width: `${fieldPct}%` }}
				/>
			)}
			<HStack
				justify="space-between"
				gap="2"
				className={css({ position: "relative", zIndex: 1 })}
			>
				<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
					{label}
				</span>
				<HStack gap="1.5" flexShrink="0">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: selected ? "primary.default" : "fg.muted",
						})}
					>
						{fieldPct !== null ? `${Math.round(fieldPct)}%` : "—"}
					</span>
					{count !== undefined && (
						<>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.subtle",
								})}
							>
								·
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: selected ? "primary.default" : "fg.subtle",
								})}
							>
								{compactCount.format(count)} {count === 1 ? "call" : "calls"}
							</span>
						</>
					)}
				</HStack>
			</HStack>
		</>
	)

	return onClick ? (
		<button type="button" onClick={onClick} className={rowClassName}>
			{content}
		</button>
	) : (
		<div className={rowClassName}>{content}</div>
	)
}
