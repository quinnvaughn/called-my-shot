import type { Request, Response } from "express"
import type { User } from "../db/schema"
import type { LeaderboardEntry } from "../lib/global-leaderboard"
import {
	clearSessionCookie,
	getSessionWithUser,
	SESSION_COOKIE_NAME,
} from "../lib/session"
import type { GroupHighlights, GroupLeaderboardEntry } from "./types/group"

export type Context = {
	req: Request
	res: Response
	sessionId: string | null
	user: User | null
	// Single-flight, per-request caches, keyed per leaderboard (leagueId
	// alone for the site-wide one, groupId+leagueId for a group's) - each
	// leaderboard has 2-3 GraphQL fields (leaderboard/viewerRank/
	// viewerLeaderboardEntry) that need the exact same ranking on the same
	// request. Caching the in-flight promise, not just the resolved value,
	// means whichever field resolves second reuses the first's DB round trip
	// instead of recomputing it from scratch. See graphql/types/leaderboard.ts
	// and graphql/types/group/leaderboard.ts.
	globalLeaderboardCache: Map<string, Promise<LeaderboardEntry[]>>
	groupLeaderboardCache: Map<string, Promise<GroupLeaderboardEntry[]>>
	// Same idea for a group's highlights band, keyed on groupId alone -
	// hotStreaks/coldStreaks/streakRecords/recentSweeps all come off one page
	// load and share one read of the roster. See graphql/types/group/
	// highlights.ts.
	groupHighlightsCache: Map<string, Promise<GroupHighlights>>
	// Every team, by id, read at most once per request. A team flair stores
	// no display fields of its own (see db/schema/flairs.ts), so each chip
	// needs its team's name, abbreviation and color - and a leaderboard page
	// renders one chip per row. Caching the in-flight promise rather than the
	// value means 25 chips share one round trip, the same single-flight trick
	// the leaderboard caches above use.
	//
	// Whole table rather than a per-id dataloader because it's ~90 rows of
	// nearly static data, so one unfiltered read beats assembling a batch.
	// See graphql/types/flair/refs.ts.
	teamsByIdCache: { promise: Promise<Map<string, FlairTeam>> | null }
}

// Just the columns a flair chip renders. Not the full Team row, so nothing
// here implies the chip can reach the rest of it.
export type FlairTeam = {
	abbreviation: string
	name: string
	color: string
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requestScopedCaches() {
	return {
		globalLeaderboardCache: new Map(),
		groupLeaderboardCache: new Map(),
		groupHighlightsCache: new Map(),
		teamsByIdCache: { promise: null },
	}
}

export async function createContext({
	req,
	res,
}: {
	req: Request
	res: Response
}): Promise<Context> {
	const sessionId = req.cookies?.[SESSION_COOKIE_NAME] ?? null

	// A cookie named "session" isn't ours to assume — some other localhost
	// project may have left one behind. Treat anything that isn't a session
	// id we could have issued as "not signed in" rather than a DB error.
	if (!sessionId || !UUID_RE.test(sessionId)) {
		if (sessionId) clearSessionCookie(res)
		return { req, res, sessionId: null, user: null, ...requestScopedCaches() }
	}

	const session = await getSessionWithUser(sessionId)
	if (!session)
		return { req, res, sessionId: null, user: null, ...requestScopedCaches() }

	return {
		req,
		res,
		sessionId: session.id,
		user: session.user,
		...requestScopedCaches(),
	}
}
