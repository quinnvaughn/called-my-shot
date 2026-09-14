import { NFL_SLOT_LABELS } from "./nfl-slot"

// Slot vocabulary is owned entirely by each week-window league's own sync
// module (see games.slot's comment in db/schema/games.ts) - this is just the
// lookup from league slug to that module's maps, not a generic mechanism.
export const SLOT_LABELS_BY_LEAGUE: Record<string, Record<string, string>> = {
	nfl: NFL_SLOT_LABELS,
}
