import { and, desc, eq, gt, inArray } from "drizzle-orm"
import { db } from "../../../db"
import {
	games,
	type Presser,
	type PresserQuestion,
	presserQuestions,
	pressers,
} from "../../../db/schema"
import { HOUR_MS } from "../../../lib/time"
import { builder } from "../../builder"
import { PresserQuestionRef, PresserRef } from "../presser/refs"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"
import { GroupRef } from "./refs"

// How far back an answer still counts as fresh: the night of the game and
// the morning after.
export const PRESSER_HIGHLIGHT_HOURS = 36
const PRESSER_HIGHLIGHT_MAX = 12

type PresserHighlight = { presser: Presser; latestAnswer: PresserQuestion }

const GroupPresserHighlightRef = builder
	.objectRef<PresserHighlight>("GroupPresserHighlight")
	.implement({
		fields: (t) => ({
			// The presser's id: each shows up once.
			id: t.id({ resolve: (h) => h.presser.id }),
			presser: t.field({ type: PresserRef, resolve: (h) => h.presser }),
			// The most recent answer on it.
			latestAnswer: t.field({
				type: PresserQuestionRef,
				resolve: (h) => h.latestAnswer,
			}),
		}),
	})

builder.objectFields(GroupRef, (t) => ({
	// Members' pressers with an answer in the last PRESSER_HIGHLIGHT_HOURS,
	// one per presser, freshest answer first. Only answered questions, which
	// are public anyway, on games in the leagues the group tracks.
	presserHighlights: t.field({
		type: [GroupPresserHighlightRef],
		resolve: async (group, _args, ctx) => {
			const [memberIds, tracked] = await Promise.all([
				memberUserIds(ctx, group.id),
				trackedLeagueIds(ctx, group.id),
			])
			if (memberIds.length === 0) return []
			const since = new Date(Date.now() - PRESSER_HIGHLIGHT_HOURS * HOUR_MS)
			const rows = await db
				.select({ presser: pressers, question: presserQuestions })
				.from(presserQuestions)
				.innerJoin(pressers, eq(pressers.id, presserQuestions.presserId))
				.innerJoin(games, eq(games.id, pressers.gameId))
				.where(
					and(
						inArray(pressers.userId, memberIds),
						eq(presserQuestions.status, "answered"),
						gt(presserQuestions.answeredAt, since),
						tracked ? inArray(games.leagueId, tracked) : undefined,
					),
				)
				.orderBy(desc(presserQuestions.answeredAt))

			const byPresser = new Map<string, PresserHighlight>()
			for (const row of rows) {
				if (byPresser.has(row.presser.id)) continue
				byPresser.set(row.presser.id, {
					presser: row.presser,
					latestAnswer: row.question,
				})
			}
			return [...byPresser.values()].slice(0, PRESSER_HIGHLIGHT_MAX)
		},
	}),
}))
