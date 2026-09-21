import { db } from "../../../db"
import type { Flair } from "../../../db/schema"
import { teams } from "../../../db/schema"
import { flairDisplay } from "../../../lib/flairs/display"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { FlairSourceEnum, FlairUnlockEnum } from "./enums"

// Just the columns a flair chip renders. Not the full Team row, so nothing
// here implies the chip can reach the rest of it.
type FlairTeam = {
	abbreviation: string
	name: string
	color: string
}

// Every team, by id, read at most once per request. A team flair stores no
// display fields of its own (see db/schema/flairs.ts), so each chip needs its
// team's name, abbreviation and color - and a leaderboard page renders one
// chip per row. Whole table rather than a per-id dataloader because it's ~90
// rows of nearly static data, so one unfiltered read beats assembling a
// batch.
function loadTeams(ctx: Context): Promise<Map<string, FlairTeam>> {
	return ctxCache(ctx, "flairTeams", async () => {
		const rows = await db
			.select({
				id: teams.id,
				abbreviation: teams.abbreviation,
				name: teams.name,
				color: teams.color,
			})
			.from(teams)
		return new Map(
			rows.map(({ id, ...team }): [string, FlairTeam] => [id, team]),
		)
	})
}

// A team flair's display fields live on its team row, so resolving one means
// reading teams. Every other source carries its own, and never touches this.
async function display(flair: Flair, ctx: Context) {
	if (flair.source !== "team") return flairDisplay(flair, null)
	const byId = await loadTeams(ctx)
	return flairDisplay(
		flair,
		flair.teamId ? (byId.get(flair.teamId) ?? null) : null,
	)
}

export const FlairRef = builder.drizzleObject("flairs", {
	name: "Flair",
	fields: (t) => ({
		id: t.exposeID("id"),
		// Null on a group-authored flair. Clients that special-case a specific
		// flair match on this rather than on a uuid, which differs per
		// environment.
		key: t.exposeString("key", { nullable: true }),
		source: t.field({
			type: FlairSourceEnum,
			resolve: (flair) => flair.source,
		}),
		unlock: t.field({
			type: FlairUnlockEnum,
			resolve: (flair) => flair.unlock,
		}),
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
