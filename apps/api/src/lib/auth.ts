import type { Context } from "../graphql/context"
import { AuthenticationError } from "./errors"

export function requireUser(ctx: Context) {
	if (!ctx.user) throw new AuthenticationError()
	return ctx.user
}
