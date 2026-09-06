import type { Request, Response } from "express"
import type { User } from "../db/schema"
import type { LeaderboardEntry } from "../lib/global-leaderboard"
import {
	clearSessionCookie,
	getSessionWithUser,
	SESSION_COOKIE_NAME,
} from "../lib/session"
import type { GroupLeaderboardEntry } from "./types/group"

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
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requestScopedCaches() {
	return {
		globalLeaderboardCache: new Map(),
		groupLeaderboardCache: new Map(),
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
