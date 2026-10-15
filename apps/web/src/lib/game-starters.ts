import { match } from "ts-pattern"
import type {
	GameStarterRole,
	GameStarters_GameFragment,
} from "#/graphql/generated/graphql"

type Starter = GameStarters_GameFragment["starters"][number]

export const ROLE_ORDER: GameStarterRole[] = [
	"STARTING_PITCHER",
	"STARTING_GOALIE",
	"BATTER",
	"OFFENSE",
	"DEFENSE",
	"STARTER",
]

export const roleLabel = (role: GameStarterRole) =>
	match(role)
		.with("STARTING_PITCHER", () => "Probable pitcher")
		.with("STARTING_GOALIE", () => "Probable goalie")
		.with("BATTER", () => "Batting order")
		.with("OFFENSE", () => "Offense")
		.with("DEFENSE", () => "Defense")
		.with("STARTER", () => "Starting five")
		.exhaustive()

export const isBaseballRole = (role: GameStarterRole) =>
	role === "STARTING_PITCHER" || role === "BATTER"

// The one line per team the collapsed card shows: the probable pitcher or
// goalie, the quarterback, or an NBA team's starting five.
export function keyStarters(starters: Starter[]): Starter[] {
	const pitchers = starters.filter((s) => s.role === "STARTING_PITCHER")
	if (pitchers.length > 0) return pitchers
	const goalies = starters.filter((s) => s.role === "STARTING_GOALIE")
	if (goalies.length > 0) return goalies
	const quarterbacks = starters.filter(
		(s) => s.role === "OFFENSE" && s.position === "QB",
	)
	if (quarterbacks.length > 0) return quarterbacks
	return starters.filter((s) => s.role === "STARTER")
}
