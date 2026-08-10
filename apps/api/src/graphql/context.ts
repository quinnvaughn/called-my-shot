import type { Request, Response } from "express"
import type { users } from "../db/schema"
import {
	clearSessionCookie,
	getSessionWithUser,
	SESSION_COOKIE_NAME,
} from "../lib/session"

export type Context = {
	req: Request
	res: Response
	sessionId: string | null
	user: typeof users.$inferSelect | null
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
		return { req, res, sessionId: null, user: null }
	}

	const session = await getSessionWithUser(sessionId)
	if (!session) return { req, res, sessionId: null, user: null }

	return { req, res, sessionId: session.id, user: session.user }
}
