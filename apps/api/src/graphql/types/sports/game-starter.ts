import { builder } from "../../builder"
import { GameStarterRole } from "./enums"

export const GameStarterRef = builder.drizzleObject("gameStarters", {
	name: "GameStarter",
	fields: (t) => ({
		id: t.exposeID("id"),
		role: t.field({ type: GameStarterRole, resolve: (s) => s.role }),
		sortOrder: t.exposeInt("sortOrder"),
		// Always set, even when `player` is null for an athlete the roster sync
		// hasn't picked up yet.
		playerName: t.exposeString("playerName"),
		position: t.exposeString("position", { nullable: true }),
		statLine: t.exposeString("statLine", { nullable: true }),
		injuryStatus: t.exposeString("injuryStatus", { nullable: true }),
		team: t.relation("team"),
		player: t.relation("player", { nullable: true }),
	}),
})
