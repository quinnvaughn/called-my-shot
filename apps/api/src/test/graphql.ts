import type { Request, Response } from "express"
import { graphql } from "graphql"
import type { User } from "../db/schema"
import type { Context } from "../graphql/context"
import { schema } from "../graphql/schema"

/**
 * A Context good enough to execute an operation. req/res are only reached by
 * the session mutations (cookie reads and writes), so they are minimal stubs
 * that record what a resolver did rather than full express objects.
 */
export function testContext(user: User | null = null): Context & {
	cookies: Record<string, string>
	clearedCookies: string[]
} {
	const cookies: Record<string, string> = {}
	const clearedCookies: string[] = []
	const res = {
		cookie: (name: string, value: string) => {
			cookies[name] = value
		},
		clearCookie: (name: string) => {
			clearedCookies.push(name)
		},
	} as unknown as Response
	return {
		req: { cookies: {}, headers: {} } as unknown as Request,
		res,
		sessionId: null,
		user,
		globalLeaderboardCache: new Map(),
		groupLeaderboardCache: new Map(),
		cookies,
		clearedCookies,
	}
}

type ExecuteOptions = {
	as?: User | null
	variables?: Record<string, unknown>
	context?: Context
}

/**
 * Runs an operation against the real schema. Returns the raw result so a test
 * can assert on `errors` as readily as on `data` - `expectData` below is the
 * shorthand for the common "this must have succeeded" case.
 */
export function execute(source: string, options: ExecuteOptions = {}) {
	return graphql({
		schema,
		source,
		contextValue: options.context ?? testContext(options.as ?? null),
		variableValues: options.variables,
	})
}

export async function expectData<T = Record<string, unknown>>(
	source: string,
	options: ExecuteOptions = {},
): Promise<T> {
	const result = await execute(source, options)
	if (result.errors?.length) {
		throw new Error(
			`GraphQL operation failed:\n${result.errors
				.map((e) => `  ${e.message}`)
				.join("\n")}`,
		)
	}
	return result.data as T
}

/**
 * The errors plugin returns failures as data (a result union with a
 * __typename and message), not as GraphQL errors, so mutation tests assert on
 * the payload rather than on `result.errors`.
 */
export type ErrorResult = { __typename: string; message?: string }
