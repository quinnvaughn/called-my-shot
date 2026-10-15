import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { RedoLine } from "#/components/questions/redo-line"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type RedoPanelData, redoVerdict } from "#/lib/redo-verdict"

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
								textStyle: "label",
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
