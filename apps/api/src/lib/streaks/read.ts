import { shapesInFamily } from "@called-my-shot/scoring"
import { db } from "../../db"
import type { Call, UserStreak, UserSweep } from "../../db/schema"
import { canonicalWinnerQuestion, compareTrackRows } from "./compute"
import { loadSlateGames } from "./recompute"
import { parseSlateKey } from "./slate"

// Handed to CallRef as bare rows. A partially loaded relation left on the
// object would be read as the whole relation.
type WithQuestion = Call & { question: unknown }
const bareCall = ({ question: _question, ...call }: WithQuestion): Call => call

// The wins that make up one run, in the order they landed. Only wins carry a
// position and a run is every win between its first and last call, so the
// run is exactly that slice of the track's ordered positions.
export async function loadRunCalls(
	track: Pick<UserStreak, "userId" | "leagueId" | "family">,
	startCallId: string | null,
	endCallId: string | null,
): Promise<Call[]> {
	if (!startCallId || !endCallId) return []
	const positions = await db.query.callStreakPositions.findMany({
		where: {
			userId: track.userId,
			leagueId: track.leagueId,
			family: track.family,
		},
		columns: { callId: true },
		with: {
			call: {
				with: {
					question: {
						columns: { id: true },
						with: { game: { columns: { startsAt: true, finalizedAt: true } } },
					},
				},
			},
		},
	})

	const ordered = positions
		.flatMap(({ call }) => {
			const game = call?.question?.game
			if (!call || !game) return []
			return [
				{
					call,
					callId: call.id,
					questionId: call.questionId,
					realizedAt: game.finalizedAt ?? game.startsAt,
					startsAt: game.startsAt,
				},
			]
		})
		.sort(compareTrackRows)

	const start = ordered.findIndex((row) => row.callId === startCallId)
	const end = ordered.findIndex((row) => row.callId === endCallId)
	if (start === -1 || end < start) return []
	return ordered.slice(start, end + 1).map((row) => bareCall(row.call))
}

// Every counted call on a track, oldest first - the same set and the same
// order computeTrack walked to build its runs. loadRunCalls above reads the
// win positions instead, which is cheaper but only covers wins: a miss
// deliberately gets no position row, so a cold run has to come from the calls
// themselves.
async function loadTrackCalls(
	track: Pick<UserStreak, "userId" | "leagueId" | "family">,
) {
	const rows = await db.query.calls.findMany({
		where: {
			userId: track.userId,
			question: {
				leagueId: track.leagueId,
				shape: { in: shapesInFamily(track.family) },
				resolutionMode: "system",
				gameId: { isNotNull: true },
				status: { in: ["resolved", "disputed"] },
			},
		},
		with: {
			question: {
				columns: { id: true },
				with: { game: { columns: { startsAt: true, finalizedAt: true } } },
			},
		},
	})

	return rows
		.flatMap((call) => {
			const game = call.question?.game
			if (!game) return []
			return [
				{
					call,
					callId: call.id,
					questionId: call.questionId,
					realizedAt: game.finalizedAt ?? game.startsAt,
					startsAt: game.startsAt,
				},
			]
		})
		.sort(compareTrackRows)
}

// The misses that make up one cold run, in the order they landed. The block
// between its first and last call is every counted call in between by
// construction - a win is what would have ended it.
export async function loadColdRunCalls(
	track: Pick<UserStreak, "userId" | "leagueId" | "family">,
	startCallId: string | null,
	endCallId: string | null,
): Promise<Call[]> {
	if (!startCallId || !endCallId) return []
	const ordered = await loadTrackCalls(track)
	const start = ordered.findIndex((row) => row.callId === startCallId)
	const end = ordered.findIndex((row) => row.callId === endCallId)
	if (start === -1 || end < start) return []
	return ordered.slice(start, end + 1).map((row) => bareCall(row.call))
}

// The user's call on each game their sweep covers, in kickoff order. Voided
// games are left out - they aren't part of the count either.
export async function loadSweepCalls(
	sweep: Pick<UserSweep, "userId" | "leagueId" | "slateKey">,
): Promise<Call[]> {
	const league = await db.query.leagues.findFirst({
		where: { id: sweep.leagueId },
		columns: { slug: true },
	})
	const slate = parseSlateKey(sweep.slateKey)
	if (!league || !slate) return []

	const slateGames = await loadSlateGames(db, sweep.leagueId, slate)
	const callIds = slateGames.flatMap((game) => {
		const question = canonicalWinnerQuestion(
			league.slug,
			game.id,
			game.questions,
		)
		if (!question || question.status === "voided") return []
		const call = question.calls.find((c) => c.userId === sweep.userId)
		return call ? [call.id] : []
	})
	if (callIds.length === 0) return []

	const rows = await db.query.calls.findMany({
		where: { id: { in: callIds } },
	})
	const byId = new Map(rows.map((row) => [row.id, row]))
	return callIds.flatMap((id) => {
		const row = byId.get(id)
		return row ? [row] : []
	})
}
