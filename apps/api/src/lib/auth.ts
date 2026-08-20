import type { Context } from "../graphql/context"
import { AuthenticationError, AuthorizationError } from "./errors"

export function requireUser(ctx: Context) {
	if (!ctx.user) throw new AuthenticationError()
	return ctx.user
}

export function requireAdmin(ctx: Context) {
	const user = requireUser(ctx)
	if (!user.isAdmin) throw new AuthorizationError("Admins only.")
	return user
}
