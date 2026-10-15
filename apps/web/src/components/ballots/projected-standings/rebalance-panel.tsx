import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"

// Stands in for the summary line while a rebalance is open: how much of the
// gap has been made up so far, and the way out either direction.
export function RebalancePanel({
	off,
	moved,
	target,
	saving,
	onCancel,
	onSave,
}: {
	off: number
	moved: number
	target: number
	saving: boolean
	onCancel: () => void
	onSave: () => void
}) {
	const over = off > 0
	const gap = Math.abs(off)
	return (
		<Card variant="subtle">
			<VStack gap="3" alignItems="stretch" padding="4">
				<VStack gap="1" alignItems="flex-start">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
							letterSpacing: "wide",
							textTransform: "uppercase",
						})}
					>
						{over
							? `${moved} of ${gap} wins taken back`
							: `${moved} of ${gap} wins added`}
					</span>
					<span className={css({ fontSize: "sm", color: "fg.muted" })}>
						{over
							? `Lower any of your teams. A rebalance can't raise a pick, and stops at the schedule's ${target}.`
							: `Raise any of your teams. A rebalance can't lower a pick, and stops at the schedule's ${target}.`}
					</span>
				</VStack>
				<HStack gap="2" justify="flex-end">
					<Button variant="ghost" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						variant="solid"
						size="sm"
						disabled={moved === 0}
						loading={saving}
						onClick={onSave}
					>
						Save
					</Button>
				</HStack>
			</VStack>
		</Card>
	)
}
