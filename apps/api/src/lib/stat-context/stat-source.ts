import {
	autoResolveStatKeyFor,
	type ResolutionModeInput,
} from "@called-my-shot/schemas"
import { type BoxStatSource, EXTRACTORS } from "../auto-resolve/registry"

export type StoredStatSource = {
	// The registry key this resolved through, so a caller can look up the
	// stat's recipe without asking autoResolveStatKeyFor a second time.
	autoResolveStatKey: string
	statKey: string
	subject: "player" | "team"
	origin: BoxStatSource["origin"]
}

// Where a question's stat lives in the stored box score, or null when it can't
// be read from one.
//
// This does no stat mapping of its own. It asks the same function resolution
// asks (autoResolveStatKeyFor), looks the answer up in the same registry
// resolution reads, and returns the `source` descriptor hanging off it. That
// is what makes a context card and a settled result incapable of disagreeing,
// and it's why adding a league needs no change here.
//
// Null covers every case where stored rows can't answer honestly:
//   - a custom stat, or a shape with no stat at all
//   - a season-scoped question (season extractors read ESPN's season endpoints,
//     not a box score; season-to-date over stored games is a different number
//     and belongs to a later card, not this lookup)
//   - a stat computed from several cells (MLB ERA, WHIP) or from something
//     that isn't a cell (team score, saves)
//   - a stat whose box-score column is season-to-date rather than per-game
//     (MLB batting average, OBP, slugging) - the trap this whole mechanism
//     exists to keep out of a game log
export function boxStatSourceFor(
	input: ResolutionModeInput,
): StoredStatSource | null {
	const key = autoResolveStatKeyFor(input)
	if (!key) return null

	const extractor = EXTRACTORS[key]
	if (extractor.scope !== "game") return null

	const source = extractor.source
	if (!source) return null

	return {
		autoResolveStatKey: key,
		statKey: source.key,
		subject: extractor.subject,
		origin: source.origin,
	}
}
