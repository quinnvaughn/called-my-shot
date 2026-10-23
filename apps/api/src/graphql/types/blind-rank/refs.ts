import { db } from "../../../db"
import type { RankItem, RankPuzzle, Team } from "../../../db/schema"
import { nextArcadeDayAt } from "../../../lib/arcade/day"
import {
	type RankPlayView,
	verifiedRankSharer,
} from "../../../lib/blind-rank/load"
import { trueSlotsOf } from "../../../lib/blind-rank/play"
import type { RankStats } from "../../../lib/blind-rank/stats"
import { builder } from "../../builder"
import { LeagueRef, TeamRef } from "../sports"
import { UserRef } from "../user"

async function loadLeague(leagueId: string) {
	const league = await db.query.leagues.findFirst({ where: { id: leagueId } })
	if (!league) throw new Error(`league ${leagueId} missing`)
	return league
}

type ItemView = { item: RankItem; team: Team | null }

// One thing to rank, as it's shown before its value is: a name, what it was
// called or who it played for, and a logo.
export const RankItemRef = builder.objectRef<ItemView>("RankItem").implement({
	fields: (t) => ({
		label: t.string({ resolve: (v) => v.item.label }),
		sublabel: t.string({ nullable: true, resolve: (v) => v.item.sublabel }),
		team: t.field({ type: TeamRef, nullable: true, resolve: (v) => v.team }),
	}),
})

// One slot of a finished game: what the player put there, whether it was
// right, and what belonged there with its value.
type SlotView = {
	slot: number
	placed: ItemView | null
	correct: boolean | null
	answer: (ItemView & { display: string }) | null
}

const RankAnswerRef = builder
	.objectRef<ItemView & { display: string }>("RankAnswer")
	.implement({
		fields: (t) => ({
			item: t.field({ type: RankItemRef, resolve: (a) => a }),
			// The value it's ranked by, "4,806".
			display: t.exposeString("display"),
		}),
	})

const RankSlotRef = builder.objectRef<SlotView>("RankSlot").implement({
	fields: (t) => ({
		// 1 is the most.
		slot: t.int({ resolve: (s) => s.slot + 1 }),
		placed: t.field({
			type: RankItemRef,
			nullable: true,
			resolve: (s) => s.placed,
		}),
		// Null until all five are placed.
		correct: t.boolean({ nullable: true, resolve: (s) => s.correct }),
		answer: t.field({
			type: RankAnswerRef,
			nullable: true,
			resolve: (s) => s.answer,
		}),
	}),
})

const itemView = (view: RankPlayView, index: number): ItemView | null => {
	const item = view.puzzle.items[index]
	if (!item) return null
	return {
		item,
		team: item.teamId ? (view.teamsById.get(item.teamId) ?? null) : null,
	}
}

export const RankPlayStatusEnum = builder.enumType("RankPlayStatus", {
	values: { PLAYING: { value: "playing" }, DONE: { value: "done" } } as const,
})

// One player's game: the slots so far and the item up next. Nothing past
// the next item, and no value, until all five are placed.
export const RankPlayRef = builder
	.objectRef<RankPlayView>("RankPlay")
	.implement({
		fields: (t) => ({
			status: t.field({
				type: RankPlayStatusEnum,
				resolve: (v) => (v.state.done ? "done" : "playing"),
			}),
			next: t.field({
				type: RankItemRef,
				nullable: true,
				resolve: (v) =>
					v.state.nextIndex === null ? null : itemView(v, v.state.nextIndex),
			}),
			// Always five, top first.
			slots: t.field({
				type: [RankSlotRef],
				resolve: (v): SlotView[] => {
					const trueOrder = v.state.trueSlots
					return Array.from({ length: v.puzzle.items.length }, (_, slot) => {
						const placedIndex = v.state.placements.indexOf(slot)
						const answerIndex = trueOrder ? trueOrder.indexOf(slot) : -1
						const answer = answerIndex >= 0 ? itemView(v, answerIndex) : null
						return {
							slot,
							placed: placedIndex >= 0 ? itemView(v, placedIndex) : null,
							correct:
								v.state.correct && placedIndex >= 0
									? (v.state.correct[placedIndex] ?? null)
									: null,
							answer:
								answer && answerIndex >= 0
									? {
											...answer,
											display: v.puzzle.items[answerIndex]?.display ?? "",
										}
									: null,
						}
					})
				},
			}),
			// How many landed in the right slot, once done.
			correctCount: t.int({
				nullable: true,
				resolve: (v) => v.state.correctCount,
			}),
		}),
	})

// A scheduled puzzle as players see it: what's ranked, never the items.
export const RankPuzzleRef = builder
	.objectRef<RankPuzzle>("RankPuzzle")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			date: t.exposeString("playDate"),
			prompt: t.exposeString("prompt"),
			context: t.exposeString("context"),
			league: t.field({
				type: LeagueRef,
				resolve: (p) => loadLeague(p.leagueId),
			}),
			nextPuzzleAt: t.field({
				type: "DateTime",
				resolve: () => nextArcadeDayAt(new Date()),
			}),
		}),
	})

// A puzzle as a share link shows it: the prompt, and the true order only
// once its day is over.
export const RankShareRef = builder
	.objectRef<{
		puzzle: RankPuzzle
		revealed: boolean
		teamsById: Map<string, Team>
	}>("RankPuzzleShare")
	.implement({
		fields: (t) => ({
			date: t.string({ resolve: (s) => s.puzzle.playDate }),
			prompt: t.string({ resolve: (s) => s.puzzle.prompt }),
			context: t.string({ resolve: (s) => s.puzzle.context }),
			league: t.field({
				type: LeagueRef,
				resolve: (s) => loadLeague(s.puzzle.leagueId),
			}),
			// Top first, with values. Null on the day.
			answer: t.field({
				type: [RankAnswerRef],
				nullable: true,
				resolve: (s) => {
					if (!s.revealed) return null
					const trueSlots = trueSlotsOf(s.puzzle.items)
					return s.puzzle.items
						.map((item, i) => ({
							item,
							slot: trueSlots[i] ?? 0,
							team: item.teamId ? (s.teamsById.get(item.teamId) ?? null) : null,
							display: item.display,
						}))
						.sort((a, b) => a.slot - b.slot)
				},
			}),
			// Who a shared link says played it (its ?by=), only when the
			// link's squares are that player's real result.
			sharer: t.field({
				type: UserRef,
				nullable: true,
				args: {
					username: t.arg.string({ required: true }),
					result: t.arg.string({ required: true }),
				},
				resolve: (s, args) =>
					verifiedRankSharer(s.puzzle, args.username, args.result),
			}),
		}),
	})

export const RankStatsRef = builder
	.objectRef<RankStats>("RankStats")
	.implement({
		fields: (t) => ({
			played: t.exposeInt("played"),
			perfect: t.exposeInt("perfect"),
			// Index n is games with n in the right slot.
			distribution: t.exposeIntList("distribution"),
			currentStreak: t.exposeInt("currentStreak"),
			bestStreak: t.exposeInt("bestStreak"),
		}),
	})
