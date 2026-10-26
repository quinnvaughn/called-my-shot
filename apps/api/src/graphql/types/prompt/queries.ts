import { db } from "../../../db"
import { type RedraftPoolEntry, redraftPool } from "../../../lib/drafts/pool"
import { searchDraftClasses } from "../../../lib/drafts/search"
import { type PoolEntry, rushmorePool } from "../../../lib/prompts/pool"
import { searchPrompts } from "../../../lib/prompts/similar-prompts"
import { normalizePromptCode } from "../../../lib/prompts/slug"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { PlayerRef } from "../sports"
import { RedraftPromptRef, RushmorePromptRef } from "./refs"

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

// Someone the redraft composer's picker offers: where he went in the draft
// and the years he played.
const RedraftPoolEntryRef = builder
	.objectRef<RedraftPoolEntry>("RedraftPoolEntry")
	.implement({
		fields: (t) => ({
			player: t.field({ type: PlayerRef, resolve: (e) => e.player }),
			// Null when he came in undrafted.
			overall: t.int({ nullable: true, resolve: (e) => e.overall }),
			firstSeason: t.int({ nullable: true, resolve: (e) => e.firstSeason }),
			lastSeason: t.int({ nullable: true, resolve: (e) => e.lastSeason }),
			hallOfFame: t.boolean({ resolve: (e) => e.hallOfFame }),
		}),
	})

async function promptByCode(kind: "rushmore" | "redraft", code: string) {
	const prompt = await db.query.prompts.findFirst({
		where: { kind, code: normalizePromptCode(code) },
	})
	return prompt && !prompt.removedAt ? prompt : null
}

builder.queryFields((t) => ({
	// A Rushmore prompt by its /rushmore/ code, any case. Null once an admin
	// took it down.
	prompt: t.field({
		type: RushmorePromptRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: (_root, args) => promptByCode("rushmore", args.code),
	}),
	// A draft class by its /redraft/ code ("nba-2003").
	redraftPrompt: t.field({
		type: RedraftPromptRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: (_root, args) => promptByCode("redraft", args.code),
	}),
	// Draft classes for the redraft composer: one league's or every one's,
	// searched by year, league or a player in the class, newest first.
	redraftClasses: t.field({
		type: [RedraftPromptRef],
		args: { leagueId: t.arg.id(), query: t.arg.string(), first: t.arg.int() },
		resolve: (_root, args) => {
			const leagueId = args.leagueId ? String(args.leagueId) : null
			if (leagueId && !isUuid(leagueId)) return []
			return searchDraftClasses({
				leagueId,
				query: args.query,
				first: args.first,
			})
		},
	}),
	// Who can go in a redraft of a class, best careers first, narrowed by name.
	redraftPool: t.field({
		type: [RedraftPoolEntryRef],
		args: {
			promptId: t.arg.id({ required: true }),
			search: t.arg.string(),
			first: t.arg.int(),
		},
		resolve: async (_root, args) => {
			const promptId = String(args.promptId)
			if (!isUuid(promptId)) return []
			const prompt = await db.query.prompts.findFirst({
				where: { id: promptId, kind: "redraft" },
			})
			if (!prompt || prompt.removedAt) return []
			return redraftPool(prompt, { search: args.search, first: args.first })
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
				where: { id: promptId, kind: "rushmore" },
			})
			if (!prompt || prompt.removedAt) return []
			return rushmorePool(prompt, { search: args.search, first: args.first })
		},
	}),
}))
