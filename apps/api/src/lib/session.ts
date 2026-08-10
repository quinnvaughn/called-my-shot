import { eq } from "drizzle-orm"
import type { Response } from "express"
import { db } from "../db"
import { sessions } from "../db/schema"
import { env } from "../env"

export const SESSION_COOKIE_NAME = "session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function createSession(userId: string) {
	const [session] = await db
		.insert(sessions)
		.values({ userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
		.returning()

	return session
}

export async function getSessionWithUser(sessionId: string) {
	const session = await db.query.sessions.findFirst({
		where: { id: sessionId },
		with: { user: true },
	})

	if (!session || session.expiresAt < new Date()) return null

	return session
}

export function deleteSession(sessionId: string) {
	return db.delete(sessions).where(eq(sessions.id, sessionId))
}

export function setSessionCookie(
	res: Response,
	session: { id: string; expiresAt: Date },
) {
	res.cookie(SESSION_COOKIE_NAME, session.id, {
		httpOnly: true,
		sameSite: "lax",
		secure: env.NODE_ENV === "production",
		expires: session.expiresAt,
	})
}

export function clearSessionCookie(res: Response) {
	res.clearCookie(SESSION_COOKIE_NAME)
}
