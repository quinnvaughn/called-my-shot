import { leaderLossSettings } from "./leader-settings"

// Moves every league stat's leader loss rate left on automatic toward where a
// pick on the favorite breaks even. Returns how many rates moved.
export const tuneLeaderLosses = leaderLossSettings.tune
