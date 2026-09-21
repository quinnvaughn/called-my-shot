import { bandSettings } from "./band-settings"

// Moves every league stat left on automatic toward the band a guess at a
// team's own average hits at break-even. Returns how many bands moved.
export const tuneBands = bandSettings.tune
