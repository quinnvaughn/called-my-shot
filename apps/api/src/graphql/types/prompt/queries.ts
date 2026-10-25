import { db } from "../../../db"
import { type PoolEntry, rushmorePool } from "../../../lib/prompts/pool"
import { searchPrompts } from "../../../lib/prompts/similar-prompts"
import { normalizePromptCode } from "../../../lib/prompts/slug"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { PlayerRef } from "../sports"
import { RushmorePromptRef } from "./refs"

// Someone the composer's picker offers, with the years beside their name:
// the stint with the franchise, or first season to last in the league.
const RushmorePoolEntryRef = builder
	.objectRef<PoolEntry>("RushmorePoolEntry")
	.implement({
		fields: (t) => ({
			player: t.field({ type: PlayerRef, resolve: (e) => e.player }),
			firstSeason: t.int({ resolve: (e) => e.firstSeason }),
			lastSeason: t.int({ resolve: (e) => e.lastSeason }),
			seasons: t.int({ resolve: (e) => e.seasons }),
			hallOfFame: t.boolean({ resolve: (e) => e.hallOfFame }),
		}),
	})

builder.queryFields((t) => ({
	// A prompt by its /rushmore/ code, any case. Null once an admin took it down.
	prompt: t.field({
		type: RushmorePromptRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			const prompt = await db.query.prompts.findFirst({
				where: { code: normalizePromptCode(args.code) },
			})
			return prompt && !prompt.removedAt ? prompt : null
		},
	}),
	// Prompts, most-answered first: every one, or a league's, or one team's.
	// With a query, only titles containing every word of it that says
	// something, which is also what the composer shows as "similar prompts"
	// while a new title is typed.
	searchPrompts: t.field({
		type: [RushmorePromptRef],
		args: {
			leagueId: t.arg.id(),
			teamId: t.arg.id(),
			query: t.arg.string(),
			first: t.arg.int(),
		},
		resolve: (_root, args) => {
			const leagueId = args.leagueId ? String(args.leagueId) : null
			const teamId = args.teamId ? String(args.teamId) : null
			if ((leagueId && !isUuid(leagueId)) || (teamId && !isUuid(teamId))) {
				return []
			}
			return searchPrompts({
				leagueId,
				teamId,
				query: args.query,
				first: args.first,
			})
		},
	}),
	// Who can be picked for a prompt, best-scored first, narrowed by name.
	rushmorePool: t.field({
		type: [RushmorePoolEntryRef],
		args: {
			promptId: t.arg.id({ required: true }),
			search: t.arg.string(),
			first: t.arg.int(),
		},
		resolve: async (_root, args) => {
			const promptId = String(args.promptId)
			if (!isUuid(promptId)) return []
			const prompt = await db.query.prompts.findFirst({
				where: { id: promptId },
			})
			if (!prompt || prompt.removedAt) return []
			return rushmorePool(prompt, { search: args.search, first: args.first })
		},
	}),
}))
