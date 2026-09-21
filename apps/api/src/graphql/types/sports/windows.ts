import type { Game } from "../../../db/schema"
import { loadReportCardResult } from "../../../lib/report-card/load"
import {
	loadSlateProgress,
	type SlateProgress,
} from "../../../lib/streaks/progress"
import type { WindowDescriptor } from "../../../lib/windows"
import { builder } from "../../builder"
import { GameRef } from "./game"
import { findLeague } from "./league"
import { ReportCardRef } from "./report-card"

// Kept for callers outside the GraphQL layer that still import windows from
// here. The domain logic lives in lib/windows.ts.

export const GameWindowRef = builder
	.objectRef<WindowDescriptor>("GameWindow")
	.implement({
		fields: (t) => ({
			key: t.exposeString("key"),
			label: t.exposeString("label"),
			sublabel: t.exposeString("sublabel", { nullable: true }),
			gameCount: t.exposeInt("gameCount"),
		}),
	})

export type SlotGroup = { slotLabel: string | null; games: Game[] }

const SweepProgressStatus = builder.enumType("SweepProgressStatus", {
	values: {
		ALIVE: { value: "alive" },
		OFF: { value: "off" },
		SWEPT: { value: "swept" },
	} as const,
})

type SlateSweepProgress = SlateProgress & { slateKey: string; games: Game[] }

// The viewer's run at sweeping the slate a slot group makes up - see
// slateProgress in lib/streaks/progress.ts.
const SlateSweepProgressRef = builder
	.objectRef<SlateSweepProgress>("SlateSweepProgress")
	.implement({
		fields: (t) => ({
			status: t.field({ type: SweepProgressStatus, resolve: (p) => p.status }),
			slateKey: t.exposeString("slateKey"),
			// Games in the slate with a who-wins question that wasn't voided.
			gameCount: t.exposeInt("gameCount"),
			calledCount: t.exposeInt("calledCount"),
			winCount: t.exposeInt("winCount"),
			lossCount: t.exposeInt("lossCount"),
			pendingCount: t.exposeInt("pendingCount"),
			// Locked without the viewer's pick.
			missedGames: t.field({
				type: [GameRef],
				resolve: (p) => p.games.filter((g) => p.missedGameIds.includes(g.id)),
			}),
			lostGames: t.field({
				type: [GameRef],
				resolve: (p) => p.games.filter((g) => p.lostGameIds.includes(g.id)),
			}),
		}),
	})

const GameSlotGroupRef = builder
	.objectRef<SlotGroup>("GameSlotGroup")
	.implement({
		fields: (t) => ({
			slotLabel: t.exposeString("slotLabel", { nullable: true }),
			games: t.field({ type: [GameRef], resolve: (g) => g.games }),
			// Null signed out, and for a group that isn't one sweepable slate.
			viewerSweep: t.field({
				type: SlateSweepProgressRef,
				nullable: true,
				resolve: async (group, _args, ctx) => {
					if (!ctx.user) return null
					const progress = await loadSlateProgress(ctx.user.id, group.games)
					return progress ? { ...progress, games: group.games } : null
				},
			}),
		}),
	})

type LeagueGamesForWindowResult = {
	leagueId: string
	window: WindowDescriptor
	prevKey: string | null
	nextKey: string | null
	groups: SlotGroup[]
}

export const LeagueGamesForWindowResultRef = builder
	.objectRef<LeagueGamesForWindowResult>("LeagueGamesForWindowResult")
	.implement({
		fields: (t) => ({
			window: t.field({ type: GameWindowRef, resolve: (r) => r.window }),
			prevKey: t.exposeString("prevKey", { nullable: true }),
			nextKey: t.exposeString("nextKey", { nullable: true }),
			groups: t.field({ type: [GameSlotGroupRef], resolve: (r) => r.groups }),
			// The window-level sibling of each slot group's viewerSweep. Hung
			// here rather than on a root query so the inline card costs no extra
			// round trip and is scoped, by construction, to the window the
			// stepper already selected. Null signed out; an empty card otherwise,
			// which the client renders as nothing.
			viewerReportCard: t.field({
				type: ReportCardRef,
				nullable: true,
				resolve: async (result, _args, ctx) => {
					if (!ctx.user || result.window.key === "") return null
					const league = await findLeague(ctx, { id: result.leagueId })
					if (!league) return null
					return loadReportCardResult(ctx.user.id, league, result.window)
				},
			}),
		}),
	})
