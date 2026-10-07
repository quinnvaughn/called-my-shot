import { db } from "../../db"
import type { Question } from "../../db/schema"
import { toReportCardCall } from "../report-card/load"
import {
	buildTrackRecord,
	optionKey,
	type TrackRecordCall,
	type TrackRecordSide,
	venueKey,
} from "./compute"

export type TrackRecordRow = {
	// What the calls in this row have in common, or null for the row of every
	// call on this shape and stat, which the heading already names.
	label: string | null
	sides: TrackRecordSide[]
}

type Side = { key: string; label: string }

// The viewer's record picking each of this question's two options, from
// every other question of the same shape and stat they've settled. Rows
// that have no side over the sample floor are left out. Null for anything
// other than a two-option question.
export async function loadTrackRecord(
	userId: string,
	question: Pick<
		Question,
		"id" | "shape" | "statId" | "gameId" | "subjectTeamId" | "subjectPlayerId"
	>,
	subjectLabel: string | null,
): Promise<TrackRecordRow[] | null> {
	const [options, game] = await Promise.all([
		db.query.questionOptions.findMany({
			where: { questionId: question.id },
			orderBy: { sortOrder: "asc" },
			columns: { label: true, teamId: true, playerId: true },
		}),
		question.gameId
			? db.query.games.findFirst({
					where: { id: question.gameId },
					columns: { homeTeamId: true, awayTeamId: true },
				})
			: null,
	])
	if (options.length !== 2) return null

	const bySide: Side[] = options.map((option) => ({
		key: optionKey(option),
		label: option.label,
	}))
	// Only when both options are this game's two teams, in the options' own
	// order so each column sits under the team it's about.
	const venues = options.map((option) => venueKey(option.teamId, game ?? null))
	const byVenue: Side[] | null = venues.every((key) => key !== null)
		? venues.map((key) => ({
				key: key as string,
				label: key === "venue:home" ? "Home" : "Road",
			}))
		: null

	const rows = await db.query.calls.findMany({
		where: {
			userId,
			question: {
				id: { ne: question.id },
				shape: question.shape,
				statId: question.statId ?? { isNull: true },
				status: "resolved",
			},
		},
		columns: {
			id: true,
			conviction: true,
			hitTolerance: true,
			resultPoints: true,
			unscoredReason: true,
			createdAt: true,
		},
		with: {
			question: {
				columns: {
					gameId: true,
					shape: true,
					isOfficial: true,
					status: true,
					lossRate: true,
					subjectTeamId: true,
					subjectPlayerId: true,
				},
				with: {
					game: { columns: { homeTeamId: true, awayTeamId: true } },
				},
			},
			selections: {
				columns: { conviction: true, resultPoints: true },
				with: {
					option: {
						columns: {
							label: true,
							teamId: true,
							playerId: true,
							isCorrect: true,
							lossRate: true,
						},
					},
				},
			},
		},
	})

	const calls = rows.flatMap((row) => {
		if (!row.question) return []
		const picked =
			row.selections.length === 1 ? row.selections[0]?.option : null
		const venue = picked
			? venueKey(picked.teamId, row.question.game ?? null)
			: null
		const call: TrackRecordCall = {
			...toReportCardCall(row.question, row),
			sideKeys: picked
				? [optionKey(picked), ...(venue ? [venue] : [])]
				: [],
		}
		const sameSubject =
			(question.subjectTeamId !== null &&
				row.question.subjectTeamId === question.subjectTeamId) ||
			(question.subjectPlayerId !== null &&
				row.question.subjectPlayerId === question.subjectPlayerId)
		return [{ call, sameSubject }]
	})
	const all = calls.map((c) => c.call)

	const candidates: TrackRecordRow[] = [
		{ label: null, sides: buildTrackRecord(all, bySide) },
		...(subjectLabel
			? [
					{
						label: subjectLabel,
						sides: buildTrackRecord(
							calls.filter((c) => c.sameSubject).map((c) => c.call),
							bySide,
						),
					},
				]
			: []),
		...(byVenue
			? [{ label: "Home or road", sides: buildTrackRecord(all, byVenue) }]
			: []),
	]
	return candidates.filter((row) => row.sides.length > 0)
}
