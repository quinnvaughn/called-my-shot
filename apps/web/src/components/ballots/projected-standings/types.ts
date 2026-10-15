// One row's stepper while rebalancing. Null where the row can't move that
// way: past what the rebalance has left, or back beyond its saved pick.
export type Adjust = {
	original: number
	down: (() => void) | null
	up: (() => void) | null
}

// Moves a row past the one below it or above it in its table. Null where
// that row can't move that way, or isn't the viewer's to move.
export type MoveHandlers = {
	up: (() => void) | null
	down: (() => void) | null
}
