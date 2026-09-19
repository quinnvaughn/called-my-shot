import { db } from "../../../db"
import type { Flair } from "../../../db/schema"
import { teams } from "../../../db/schema"
import { flairDisplay } from "../../../lib/flairs/display"
import { builder } from "../../builder"
import type { Context, FlairTeam } from "../../context"
import { FlairSourceEnum, FlairUnlockEnum } from "./enums"

// One read of the teams table per request, shared by every chip on the page.
// See the teamsByIdCache comment in graphql/context.ts for why it's the whole
// table rather than a batched subset.
function loadTeams(ctx: Context): Promise<Map<string, FlairTeam>> {
	if (!ctx.teamsByIdCache.promise) {
		ctx.teamsByIdCache.promise = db
			.select({
				id: teams.id,
				abbreviation: teams.abbreviation,
				name: teams.name,
				color: teams.color,
			})
			.from(teams)
			.then(
				(rows) =>
					new Map(
						rows.map((row) => [
							row.id,
							{
								abbreviation: row.abbreviation,
								name: row.name,
								color: row.color,
							},
						]),
					),
			)
	}
	return ctx.teamsByIdCache.promise
}

// A team flair's display fields live on its team row, so resolving one means
// reading teams. Every other source carries its own, and never touches this.
async function display(flair: Flair, ctx: Context) {
	if (flair.source !== "team") return flairDisplay(flair, null)
	const byId = await loadTeams(ctx)
	return flairDisplay(flair, flair.teamId ? (byId.get(flair.teamId) ?? null) : null)
}

export const FlairRef = builder.drizzleObject("flairs", {
	name: "Flair",
	fields: (t) => ({
		id: t.exposeID("id"),
		// Null on a group-authored flair. Clients that special-case a specific
		// flair match on this rather than on a uuid, which differs per
		// environment.
		key: t.exposeString("key", { nullable: true }),
		source: t.field({ type: FlairSourceEnum, resolve: (flair) => flair.source }),
		unlock: t.field({ type: FlairUnlockEnum, resolve: (flair) => flair.unlock }),
		// The three below are resolved server-side precisely so no client ever
		// branches on source: a chip gets an icon, a label and a color, and
		// doesn't care that a team flair's came off the team row.
		icon: t.string({
			resolve: async (flair, _args, ctx) => (await display(flair, ctx)).icon,
		}),
		label: t.string({
			resolve: async (flair, _args, ctx) => (await display(flair, ctx)).label,
		}),
		// Raw hex, arbitrary per team, so the client sets it as an inline style
		// rather than a theme token - same story as Team.color.
		color: t.string({
			resolve: async (flair, _args, ctx) => (await display(flair, ctx)).color,
		}),
		// The one line under a flair in the picker. Null on a team flair, which
		// needs no explanation.
		description: t.exposeString("description", { nullable: true }),
		team: t.relation("team", { nullable: true }),
	}),
})
