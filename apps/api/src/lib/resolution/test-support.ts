import { db } from "../../db"

// The one user_season_stats row a test's user has (tests stay in one season).
export const statsFor = (userId: string) =>
	db.query.userSeasonStats.findFirst({ where: { userId } })

export const selectionFor = (id: string) =>
	db.query.callSelections.findFirst({ where: { id } })

// An unscoredUserIds map excluding one caller as the question's sole caller.
export const soleCaller = (userId: string) =>
	new Map([[userId, "creator_sole_caller" as const]])
