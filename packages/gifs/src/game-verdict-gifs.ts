import type { CallGif } from "./call-gifs"

// What a finished game's entry page shows under its stamp: a perfect card
// (every settled call right) or an oh-fer (every one wrong). See
// gameEntryVerdict in apps/api's lib/game-entry.ts for when each applies.
//
// Same format and hotlinking rules as the call pools - see the header comment
// in ./call-gifs. /admin/gifs checks these under "perfect" and "oh_fer".
export const PERFECT_GIFS: readonly CallGif[] = []

export const OH_FER_GIFS: readonly CallGif[] = []
