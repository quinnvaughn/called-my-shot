import type { ReactNode } from "react"
import type {
	ImagePlayer,
	ImageTeam,
} from "#/components/ui/player-or-team-image"
import type { ViewerStatusCard_QuestionFragment } from "#/graphql/generated/graphql"

export type ViewerCall = NonNullable<
	ViewerStatusCard_QuestionFragment["viewerCall"]
>

// The player or team a pick is, shown beside its name.
export type PickSubject = {
	player?: ImagePlayer | null
	team?: ImageTeam | null
}

// A short ledger, not prose - each row labeled with what it IS (COMMITTED,
// IF RIGHT, IF WRONG) rather than just showing bare math. The committed
// amount is styled consistently (bold, full-strength text) everywhere it
// appears, including inside the other rows' math, so it reads as "that same number,
// multiplied" rather than an unexplained coincidence. IF WRONG only appears
// for a shape whose loss rate is under 1 - at a full loss COMMITTED already
// IS the downside, so a separate "-130 flat" row would just repeat it.
export type LedgerRow = { label: string; math: ReactNode }
export type Breakdown = { ledger: LedgerRow[]; note?: string }
// A resolved pick's second ledger row plus the note under it - both depend on
// whether the pick hit.
export type ResultLedger = LedgerRow & { note?: string }
