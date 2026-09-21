import type { Request, Response } from "express"
import type { User } from "../db/schema"
import {
	clearSessionCookie,
	getSessionWithUser,
	SESSION_COOKIE_NAME,
} from "../lib/session"
import { isUuid } from "../lib/uuid"

export type Context = {
	req: Request
	res: Response
	sessionId: string | null
	user: User | null
	// Backs ctxCache below. Lives and dies with the request.
	cache: Map<string, unknown>
	// Accounts this request has proven it owns without a session behind it
	// yet: signUp/signIn return the User before the cookie is ever read back,
	// and confirmEmailChange is authorised by its token alone. canSeePrivate
	// (lib/auth.ts) treats these the same as the signed-in viewer.
	ownedUserIds: Set<string>
}

// Builds a value at most once per request under `key` and hands every later
// caller the same one. Several GraphQL fields on one page often need the same
// expensive read (a leaderboard's ranking, a group's highlights, the teams
// table behind every flair chip); caching the in-flight promise rather than
// the settled value means whichever field asks second shares the first one's
// round trip instead of starting its own. Also holds per-request DataLoaders.
//
// Keys are namespaced by the caller ("groupLeaderboard:<groupId>:..."), and
// each namespace must always build the same type.
export function ctxCache<T>(ctx: Context, key: string, build: () => T): T {
	if (ctx.cache.has(key)) return ctx.cache.get(key) as T
	const value = build()
	ctx.cache.set(key, value)
	return value
}

export function requestScopedCaches(): Pick<Context, "cache" | "ownedUserIds"> {
	return {
		cache: new Map(),
		ownedUserIds: new Set(),
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
	if (!sessionId || !isUuid(sessionId)) {
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
