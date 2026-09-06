// The zone every user-facing game date in this app is expressed in, whoever
// renders it. US sports schedules are published and discussed in ET, and the
// Games tab already buckets a game into its day/week by this zone (see
// Game.windowKey and getLeagueWindows in apps/api) - so a title that named a
// game's date in any other zone would disagree with the day that same game
// is filed under.
//
// Fixed rather than taken from the environment on purpose. Title generation
// runs in two places - the create-question form in the browser and the
// season/sync question jobs on the server - and an environment-derived zone
// makes the date depend on which one happened to produce the question, and
// on where the server runs.
export const SPORTS_TIME_ZONE = "America/New_York"
