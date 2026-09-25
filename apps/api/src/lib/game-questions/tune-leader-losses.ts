import { leaderLossSettings } from "./leader-settings"

// Moves every league stat's leader loss rate left on automatic toward where a
// pick on the favorite clears PLAYER_EDGE. Returns how many rates moved.
export const tuneLeaderLosses = leaderLossSettings.tune
