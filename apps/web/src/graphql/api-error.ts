import { P } from "ts-pattern"

/**
 * The error members most result unions share, for one `.with()` arm when
 * a caller handles all three the same way. Each carries a `message`.
 */
export const ApiError = P.union(
	{ __typename: "AuthenticationError" as const },
	{ __typename: "AuthorizationError" as const },
	{ __typename: "NotFoundError" as const },
)
