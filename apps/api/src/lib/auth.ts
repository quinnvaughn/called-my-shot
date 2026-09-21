import type { Context } from "../graphql/context"
import { AuthenticationError, AuthorizationError } from "./errors"

export function requireUser(ctx: Context) {
	if (!ctx.user) throw new AuthenticationError()
	return ctx.user
}

// Whether the request may read a user's private fields (email address, mail
// preferences, bounce state): that user themselves, or an admin.
export function canSeePrivate(ctx: Context, userId: string): boolean {
	if (ctx.ownedUserIds.has(userId)) return true
	return ctx.user != null && (ctx.user.id === userId || ctx.user.isAdmin)
}

export function requireAdmin(ctx: Context) {
	const user = requireUser(ctx)
	if (!user.isAdmin) throw new AuthorizationError("Admins only.")
	return user
}
