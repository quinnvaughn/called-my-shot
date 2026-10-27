import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"

// Shown as soon as no route from the chain's last player can reach the
// target in the links left, so nobody spends picks on a chain that can't
// finish. Taking that player back is the way out.
export function ChainDeadEnd({
	lastName,
	targetName,
	disabled,
	onUndo,
}: {
	lastName: string
	targetName: string
	disabled: boolean
	onUndo: () => void
}) {
	return (
		<output
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				flexWrap: "wrap",
				padding: "4",
				borderRadius: "xl",
				border: "1px solid {colors.warning.default}",
				bg: "bg.surface",
			})}
		>
			<p className={css({ fontSize: "sm", flex: "1", minWidth: "48" })}>
				<span className={css({ fontWeight: "semibold" })}>Dead end.</span> No
				route from {lastName} reaches {targetName} in the links you have left.
			</p>
			<Button variant="outline" size="sm" disabled={disabled} onClick={onUndo}>
				Take back {lastName}
			</Button>
		</output>
	)
}
