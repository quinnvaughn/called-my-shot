import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { pluralize } from "#/lib/pluralize"

type Props = {
	label: string
	// Before the label: the option's player headshot or team logo, when it is
	// one (see PlayerOrTeamImage).
	image?: ReactNode
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
	// Inside a link that handles the tap itself (QuestionCard's pickable
	// rows): still a plain element, since a button can't sit in an <a>, but
	// with the pointer and hover of one, and its option id for the link to
	// read off the tap.
	targetId?: string
	// "pick" (the default) is the live picker's orange: choosing an option is
	// part of the primary action. "record" is for a breakdown of calls
	// already made - the highlighted row is where the viewer stands, in the
	// secondary blue, and the crowd's fills go neutral. "field" is pick's
	// scheme in the blue, for a read-only view of the field with nothing to
	// act on (QuestionCard): orange is reserved for actions.
	tone?: "pick" | "record" | "field"
	// What picking this option would pay if right and cost if wrong, at
	// whatever conviction the caller names alongside the list. Omitted where
	// there's nothing left to pick.
	points?: { win: number; lose: number } | null
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
	image,
	fieldPct,
	count,
	selected,
	onClick,
	tone = "pick",
	points,
	targetId,
}: Props) {
	const isTarget = onClick !== undefined || targetId !== undefined
	const isPick = tone === "pick"
	const rowClassName = css({
		position: "relative",
		width: "full",
		textAlign: "left",
		background: "card",
		border: selected
			? isPick
				? "1px solid {colors.primary.default}"
				: "1px solid {colors.secondary.default}"
			: "1px solid {colors.border.default}",
		borderRadius: "md",
		padding: "3",
		overflow: "hidden",
		cursor: isTarget ? "pointer" : "default",
		// Selected already owns the border color - a hover rule with no
		// selected guard wins on source order regardless of specificity,
		// so it was silently overriding primary.default back to
		// border.emphasized on any selected row the pointer sat over.
		_hover:
			!isTarget || selected
				? {}
				: { border: "1px solid {colors.border.emphasized}" },
	})

	const content = (
		<>
			{fieldPct !== null && (
				<div
					className={css({
						position: "absolute",
						inset: "0",
						backgroundColor: selected
							? isPick
								? "primary.default/18"
								: "secondary.default/18"
							: tone === "record"
								? "fg.default/6"
								: isPick
									? "primary.default/10"
									: "secondary.default/10",
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
				<HStack gap="2" alignItems="center" minWidth="0">
					{image}
					<VStack gap="0" alignItems="flex-start" minWidth="0">
						<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
							{label}
						</span>
						{points && (
							<span className={css({ textStyle: "meta" })}>
								<span className={css({ color: "success.default" })}>
									+{points.win}
								</span>
								<span className={css({ color: "fg.subtle" })}> / </span>
								<span className={css({ color: "danger.default" })}>
									−{points.lose}
								</span>
							</span>
						)}
					</VStack>
				</HStack>
				{/* Nothing to say about the field until someone has called it. */}
				{(fieldPct !== null || (count ?? 0) > 0) && (
				<HStack gap="1.5" flexShrink="0">
					<span
						className={css({
							textStyle: "metaLg",
							color: selected
								? isPick
									? "primary.default"
									: "secondary.default"
								: "fg.muted",
						})}
					>
						{fieldPct !== null ? `${Math.round(fieldPct)}%` : "-"}
					</span>
					{count !== undefined && (
						<>
							<span
								className={css({
									textStyle: "metaLg",
									color: "fg.subtle",
								})}
							>
								·
							</span>
							<span
								className={css({
									textStyle: "metaLg",
									color: selected
										? isPick
											? "primary.default"
											: "secondary.default"
										: "fg.subtle",
								})}
							>
								{compactCount.format(count)} {pluralize(count, "call")}
							</span>
						</>
					)}
				</HStack>
				)}
			</HStack>
		</>
	)

	return onClick ? (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onClick}
			className={rowClassName}
		>
			{content}
		</button>
	) : (
		<div data-option-target={targetId} className={rowClassName}>
			{content}
		</div>
	)
}
