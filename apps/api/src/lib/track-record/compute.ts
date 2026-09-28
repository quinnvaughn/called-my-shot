import { classifyCall, type ReportCardCall } from "../report-card/compute"

// The pure half of the track record - how a caller has done picking each of
// a two-option question's options before. ./load.ts reads the rows; same
// split as lib/report-card.

export type TrackRecordCall = ReportCardCall & {
	// Every side the caller's pick counts toward: its optionKey, plus its
	// venueKey when it was a team in that team's own game. Empty for a call
	// that didn't make exactly one pick, which never counts toward any side.
	sideKeys: string[]
}

export type TrackRecordSide = {
	label: string
	wins: number
	losses: number
	netPoints: number
}

// The fewest settled calls a side needs before its record is shown. Below
// this a record is one or two games relabelled, not a tendency.
export const TRACK_RECORD_MIN_SETTLED = 3

// What makes two options on different questions "the same pick": the team
// or player behind it when there is one, otherwise its label, so every Over
// is one side and every Yes another.
export function optionKey(option: {
	label: string
	teamId: string | null
	playerId: string | null
}): string {
	if (option.teamId) return `team:${option.teamId}`
	if (option.playerId) return `player:${option.playerId}`
	return `label:${option.label.trim().toLowerCase()}`
}

// Which end of the game a team option is, for a question on a game - picking
// the home side is a tendency of its own, whichever teams are playing.
export function venueKey(
	teamId: string | null,
	game: { homeTeamId: string; awayTeamId: string } | null,
): string | null {
	if (!teamId || !game) return null
	if (teamId === game.homeTeamId) return "venue:home"
	if (teamId === game.awayTeamId) return "venue:away"
	return null
}

// One row per side in the order given, settled calls only, and a side with
// too few calls is left out rather than sent for the client to hide.
export function buildTrackRecord(
	calls: TrackRecordCall[],
	sides: { key: string; label: string }[],
): TrackRecordSide[] {
	return sides.flatMap(({ key, label }) => {
		const record = { label, wins: 0, losses: 0, netPoints: 0 }
		for (const call of calls) {
			if (!call.sideKeys.includes(key)) continue
			const classification = classifyCall(call)
			if (classification.kind !== "settled") continue
			if (classification.won) record.wins += 1
			else record.losses += 1
			record.netPoints += call.netPoints ?? 0
		}
		return record.wins + record.losses >= TRACK_RECORD_MIN_SETTLED
			? [record]
			: []
	})
}
