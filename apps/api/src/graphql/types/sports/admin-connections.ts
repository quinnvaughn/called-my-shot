import type { Game, League, Player, Team } from "../../../db/schema"
import type { AdminConnection } from "../../../lib/admin-pagination"
import { builder } from "../../builder"
import { PageInfoRef } from "../pagination"
import { PlayerRef } from "./catalog"
import { GameRef } from "./game"
import { LeagueRef } from "./league"
import { TeamRef } from "./team"

export const AdminLeagueConnectionRef = builder
	.objectRef<AdminConnection<League>>("AdminLeagueConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [LeagueRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

export const AdminTeamConnectionRef = builder
	.objectRef<AdminConnection<Team>>("AdminTeamConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [TeamRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

export const AdminPlayerConnectionRef = builder
	.objectRef<AdminConnection<Player>>("AdminPlayerConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [PlayerRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

export const AdminGameConnectionRef = builder
	.objectRef<AdminConnection<Game>>("AdminGameConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [GameRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})
