import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"

export type RedoPanelData = {
	// Both already formatted (see formatCallDate).
	originalCalledAt: string
	redoneAt: string
	// What the call used to say, formatted the same way the live pick is (see
	// pickSummary), so the two read as the same kind of thing.
	originalPickLabel: string
	currentPickLabel: string
	originalCaseText: string | null
	// Null until the question resolves. Whether the pick they walked away
	// from would have been the right one.
	originalWasCorrect: boolean | null
	currentIsWin: boolean | null
}

// The before and after of a redo, on the call's own page.
//
// The only place the abandoned pick is shown. A redo badge in a feed says one
// happened; someone who opens the call has gone looking, and this is what
// they came for - especially the case where the first call was already right.
export function RedoPanel({ data }: { data: RedoPanelData }) {
	const verdict = redoVerdict(data)

	return (
		<Card size="sm">
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<Eyebrow size="sm" variant="neutral">
						Cold feet
					</Eyebrow>

					<VStack gap="2" alignItems="stretch">
						<RedoLine
							label="First call"
							at={data.originalCalledAt}
							pick={data.originalPickLabel}
							struck
						/>
						<RedoLine
							label="Redo"
							at={data.redoneAt}
							pick={data.currentPickLabel}
						/>
					</VStack>

					{data.originalCaseText && (
						<p
							className={css({
								fontSize: "xs",
								color: "fg.subtle",
								fontStyle: "italic",
								borderInlineStart: "2px solid {colors.border.default}",
								paddingInlineStart: "2.5",
							})}
						>
							{data.originalCaseText}
						</p>
					)}

					{verdict && (
						<p
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								textTransform: "uppercase",
								letterSpacing: "wide",
								color: "fg.default",
							})}
						>
							{verdict}
						</p>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}

function RedoLine({
	label,
	at,
	pick,
	struck,
}: {
	label: string
	at: string
	pick: string
	struck?: boolean
}) {
	return (
		<HStack gap="3" alignItems="baseline" justify="space-between">
			<HStack gap="2.5" alignItems="baseline">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "3xs",
						textTransform: "uppercase",
						letterSpacing: "wide",
						color: "fg.subtle",
						minWidth: "5.5rem",
					})}
				>
					{label}
				</span>
				<span
					className={
						struck
							? css({
									fontWeight: "semibold",
									color: "fg.subtle",
									textDecoration: "line-through",
								})
							: css({ fontWeight: "semibold", color: "fg.default" })
					}
				>
					{pick}
				</span>
			</HStack>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					color: "fg.subtle",
					whiteSpace: "nowrap",
				})}
			>
				{at}
			</span>
		</HStack>
	)
}

// What the redo actually cost or saved, once the question has settled. The
// first case is the whole reason the original pick is kept and shown at all.
function redoVerdict(data: RedoPanelData): string | null {
	if (data.originalWasCorrect === null || data.currentIsWin === null) {
		return null
	}
	if (data.originalWasCorrect && !data.currentIsWin) {
		return "Should have stuck with it."
	}
	if (!data.originalWasCorrect && data.currentIsWin) {
		return "Saved by the redo."
	}
	if (data.originalWasCorrect && data.currentIsWin) {
		return "Right either way."
	}
	return "Wrong either way."
}
