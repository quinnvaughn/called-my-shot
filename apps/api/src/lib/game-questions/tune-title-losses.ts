import { titleLossSettings } from "./title-settings"

// Moves every league title's loss rate left on automatic toward where a pick
// on the best record breaks even. Returns how many rates moved.
export const tuneTitleLosses = titleLossSettings.tune
