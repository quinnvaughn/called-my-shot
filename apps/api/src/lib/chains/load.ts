import type { ChainLinkFacts, ChainLinkOutcome } from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import {
	type CallUnscoredReason,
	type ChainLink,
	chainLinks,
	type Question,
} from "../../db/schema"
import type { DbOrTx } from "../../db/types"

// One link with everything its place in the chain is read from: its
// question's status and lock, its game's times, and how its one pick landed.
export type LoadedLink = ChainLink & {
	question: Pick<
		Question,
		| "id"
		| "title"
		| "shape"
		| "status"
		| "locksAt"
		| "resolvedAt"
		| "leagueId"
		| "seasonId"
		| "ouLine"
	>
	game: {
		id: string
		startsAt: Date
		finalizedAt: Date | null
		matchup: string
	}
	pick: {
		optionId: string
		label: string
		isCorrect: boolean | null
		resultPoints: number | null
	} | null
	unscoredReason: CallUnscoredReason | null
}

// Every link of each chain, whatever its status, oldest request first.
export async function loadChainLinks(
	chainIds: string[],
	executor: DbOrTx = db,
): Promise<Map<string, LoadedLink[]>> {
	const byChain = new Map<string, LoadedLink[]>(chainIds.map((id) => [id, []]))
	if (chainIds.length === 0) return byChain
	const links = await executor.query.chainLinks.findMany({
		where: { chainId: { in: chainIds } },
		orderBy: { requestedAt: "asc" },
		with: {
			question: {
				columns: {
					id: true,
					title: true,
					shape: true,
					status: true,
					locksAt: true,
					resolvedAt: true,
					leagueId: true,
					seasonId: true,
					ouLine: true,
				},
			},
			game: {
				columns: { id: true, startsAt: true, finalizedAt: true },
				with: {
					homeTeam: { columns: { abbreviation: true } },
					awayTeam: { columns: { abbreviation: true } },
				},
			},
			call: {
				columns: { unscoredReason: true },
				with: {
					selections: {
						columns: { optionId: true, resultPoints: true },
						with: { option: { columns: { label: true, isCorrect: true } } },
					},
				},
			},
		},
	})
	for (const { question, game, call, ...link } of links) {
		if (!question || !game || !call) continue
		const selection = call.selections[0]
		byChain.get(link.chainId)?.push({
			...link,
			question,
			game: {
				id: game.id,
				startsAt: game.startsAt,
				finalizedAt: game.finalizedAt,
				matchup: `${game.awayTeam?.abbreviation ?? "?"} @ ${game.homeTeam?.abbreviation ?? "?"}`,
			},
			pick: selection?.option
				? {
						optionId: selection.optionId,
						label: selection.option.label,
						isCorrect: selection.option.isCorrect,
						resultPoints: selection.resultPoints,
					}
				: null,
			unscoredReason: call.unscoredReason,
		})
	}
	return byChain
}

// The chains a question is an approved link in.
export async function chainIdsForQuestion(
	executor: DbOrTx,
	questionId: string,
): Promise<string[]> {
	const rows = await executor
		.selectDistinct({ chainId: chainLinks.chainId })
		.from(chainLinks)
		.where(
			and(
				eq(chainLinks.questionId, questionId),
				eq(chainLinks.status, "approved"),
			),
		)
	return rows.map((row) => row.chainId)
}

// Where one link stands. A link counts once its question has a standing
// result - resolved, or disputed and still carrying the result under dispute
// - and its call was scored, the same rule a streak counts by.
export function linkOutcome(link: LoadedLink): ChainLinkOutcome {
	if (link.question.status === "voided" || link.unscoredReason !== null) {
		return "void"
	}
	if (
		link.question.status !== "resolved" &&
		link.question.status !== "disputed"
	) {
		return "pending"
	}
	if (!link.pick || link.pick.isCorrect === null) return "pending"
	return link.pick.isCorrect ? "hit" : "miss"
}

export function linkFacts(link: LoadedLink): ChainLinkFacts {
	return {
		linkId: link.id,
		userId: link.userId,
		questionId: link.questionId,
		hitChance: link.hitChance,
		outcome: linkOutcome(link),
		resultPoints: link.pick?.resultPoints ?? null,
		realizedAt: link.game.finalizedAt ?? link.game.startsAt,
		startsAt: link.game.startsAt,
	}
}
