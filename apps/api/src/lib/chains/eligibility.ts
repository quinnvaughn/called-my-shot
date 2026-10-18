import {
	CHAIN_LINK_SHAPES,
	CHAIN_OVER_UNDER_SHAPES,
	chainHitChance,
} from "@called-my-shot/scoring"
import type { Question } from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import { isAcceptingCalls } from "../cast-call"

type LinkQuestion = Pick<
	Question,
	| "id"
	| "shape"
	| "status"
	| "locksAt"
	| "isOfficial"
	| "gameId"
	| "resolutionMode"
	| "leagueId"
	| "lineBasis"
>

type LinkSelection = { label: string; modelHitRate: number | null }

// A link's chance of hitting, read the same way at request and approval -
// see chainHitChance. An over/under's side is its option's label.
export function linkHitChance(
	question: Pick<LinkQuestion, "shape" | "lineBasis">,
	selection: LinkSelection,
): number | null {
	const label = selection.label.toLowerCase()
	const overUnder =
		CHAIN_OVER_UNDER_SHAPES.has(question.shape) &&
		(label === "over" || label === "under")
			? {
					side: label as "over" | "under",
					pOver: question.lineBasis?.pOver ?? null,
				}
			: null
	return chainHitChance({ modelHitRate: selection.modelHitRate, overUnder })
}

export type CandidateCall = {
	question: LinkQuestion
	selections: LinkSelection[]
}

// Why a call can't be a link in a chain in this group, or null if it can.
// Says nothing about the chain itself (who else is in it, which games it
// already covers) - see lib/chains/mutate.ts for those.
export function ineligibleReason(
	call: CandidateCall,
	trackedLeagueIds: string[] | null,
	now = new Date(),
): string | null {
	const { question } = call
	if (!question.isOfficial || question.resolutionMode !== "system") {
		return "Only official questions can be links."
	}
	if (!question.gameId || !CHAIN_LINK_SHAPES.has(question.shape)) {
		return "Only single-game picks and over/unders can be links."
	}
	if (
		trackedLeagueIds !== null &&
		!trackedLeagueIds.includes(question.leagueId)
	) {
		return "This group doesn't follow that league."
	}
	if (!isAcceptingCalls(question, now)) return "That game has already locked."
	const [selection, ...rest] = call.selections
	if (!selection || rest.length > 0) return "A link has to be one pick."
	if (linkHitChance(question, selection) === null) {
		return "This pick has no odds to chain on."
	}
	return null
}

export type LoadedCandidateCall = CandidateCall & {
	id: string
	userId: string
	gameId: string | null
	selections: (LinkSelection & { optionId: string })[]
}

export async function loadCandidateCall(
	executor: DbOrTx,
	callId: string,
): Promise<LoadedCandidateCall | null> {
	const call = await executor.query.calls.findFirst({
		where: { id: callId },
		columns: { id: true, userId: true },
		with: {
			question: {
				columns: {
					id: true,
					shape: true,
					status: true,
					locksAt: true,
					isOfficial: true,
					gameId: true,
					resolutionMode: true,
					leagueId: true,
					lineBasis: true,
				},
			},
			selections: {
				columns: { optionId: true, modelHitRate: true },
				with: { option: { columns: { label: true } } },
			},
		},
	})
	if (!call?.question) return null
	return {
		id: call.id,
		userId: call.userId,
		gameId: call.question.gameId,
		question: call.question,
		selections: call.selections.map((s) => ({
			optionId: s.optionId,
			label: s.option?.label ?? "",
			modelHitRate: s.modelHitRate,
		})),
	}
}
