import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import {
	biggestSwing,
	columnWidths,
	type PointsGroup,
} from "#/lib/points-breakdown"
import { BreakdownGroup } from "./breakdown-group"

type Props = {
	groups: PointsGroup[]
	username: string
}

// Where the points came from, one bar per row out from a shared zero line:
// right and green for what a row netted, left and red for what it cost. Each
// view's bars, nested ones included, are scaled against that view's biggest
// swing, so leagues are compared with leagues and play types with play types.
// A view on the card scale is measured against the biggest swing anywhere on
// the card.
export function PointsBreakdown({ groups, username }: Props) {
	const views = groups.flatMap((group) => group.views)
	const max = biggestSwing(views)
	const columns = columnWidths(views)

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					{groups.map((group, index) => (
						<BreakdownGroup
							key={group.views.map((view) => view.label).join("|")}
							group={group}
							max={max}
							columns={columns}
							username={username}
							divided={index > 0}
						/>
					))}
				</VStack>
			</Card.Body>
		</Card>
	)
}
