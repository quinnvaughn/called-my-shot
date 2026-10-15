import { hashKey } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { EMPTY_FILTERS } from "#/components/filters/question-filter-bar"
import { myQuestionsQuery } from "#/graphql/my-questions/queries"
import {
	DEFAULT_MY_LIST_DIRECTION,
	DEFAULT_MY_QUESTIONS_SORT,
	MY_CALL_SORTS,
} from "#/lib/my-list-sorts"
import { toQueryFilters } from "#/routes/_app/_authed/my-calls"
import { myCallCountsQuery, myCallsQuery, myLiveCallsQuery } from "./queries"

// The My Calls loader hands one combined query's fields straight to the caches
// the page renders off, and the My Questions loader prefetches its list. Both
// only pay off if the seeded key is byte-for-byte the key the component asks
// for on its first render - and when it isn't, nothing breaks loudly: the page
// just silently refetches what it already had, and every tab switch starts a
// request that the next switch cancels (an `aborted` overlay in dev).
//
// These compare the two keys through react-query's own hash, which is what the
// cache actually looks rows up by.
describe("loader seeds land on the keys the components read", () => {
	it("seeds each My Calls tab under its own default sort", () => {
		expect(
			hashKey(
				myCallsQuery(
					"OPEN",
					{ scope: "GAME" },
					MY_CALL_SORTS.open.default,
					DEFAULT_MY_LIST_DIRECTION,
				).queryKey,
			),
		).toBe(
			hashKey(myCallsQuery("OPEN", { scope: "GAME" }, "DATE", "DESC").queryKey),
		)

		expect(
			hashKey(
				myCallsQuery(
					"RESOLVED",
					{ scope: "GAME" },
					MY_CALL_SORTS.resolved.default,
					DEFAULT_MY_LIST_DIRECTION,
				).queryKey,
			),
		).toBe(
			hashKey(
				myCallsQuery("RESOLVED", { scope: "GAME" }, "POINTS", "DESC").queryKey,
			),
		)
	})

	// The bug this is really guarding against: seeding with no sort while the
	// component sends one is a different cache entry, not a looser match.
	it("treats an absent sort as a different key from an explicit one", () => {
		expect(hashKey(myCallsQuery("OPEN").queryKey)).not.toBe(
			hashKey(myCallsQuery("OPEN", {}, "DATE").queryKey),
		)
	})

	it("seeds the unfiltered counts under the key an unfiltered page reads", () => {
		expect(hashKey(myCallCountsQuery({ scope: "GAME" }).queryKey)).toBe(
			hashKey(
				myCallCountsQuery(toQueryFilters(EMPTY_FILTERS, "", "open", "game"))
					.queryKey,
			),
		)
	})

	// The other half of the match: the loader seeds with only the Games scope,
	// so an untouched filter bar has to serialise to exactly that. Sending an
	// empty string or an empty array instead of omitting the variable would be
	// a different key and would quietly undo the seed.
	it("serialises an untouched filter bar to the scope alone", () => {
		expect(toQueryFilters(EMPTY_FILTERS, "", "open", "game")).toEqual({
			scope: "GAME",
		})
		expect(toQueryFilters(EMPTY_FILTERS, "", "resolved", "season")).toEqual({
			scope: "SEASON_LONG",
		})

		expect(
			hashKey(
				myCallsQuery(
					"OPEN",
					toQueryFilters(EMPTY_FILTERS, "", "open", "game"),
					MY_CALL_SORTS.open.default,
				).queryKey,
			),
		).toBe(
			hashKey(
				myCallsQuery("OPEN", { scope: "GAME" }, MY_CALL_SORTS.open.default)
					.queryKey,
			),
		)
	})

	// The Resolved tab's own filter must not ride along on the Open tab, where
	// it would match nothing (an open call has no outcome yet).
	it("keeps the result filter off the open tab", () => {
		const withResult = { ...EMPTY_FILTERS, result: "HIT" as const }
		expect(toQueryFilters(withResult, "", "open", "game")).toEqual({
			scope: "GAME",
		})
		expect(toQueryFilters(withResult, "", "resolved", "game")).toEqual({
			scope: "GAME",
			result: "HIT",
		})
	})

	// The Playing Now section reads under the filters the page opens on, and
	// the loader seeds it unfiltered. `result` never reaches it at all - it's a
	// Resolved-tab filter, and no live call has an outcome yet - and neither
	// does `scope`, since every live call is a game call. Passing either has to
	// land on the same key as passing none.
	it("seeds the live calls under the key an unfiltered open tab reads", () => {
		expect(hashKey(myLiveCallsQuery().queryKey)).toBe(
			hashKey(
				myLiveCallsQuery(toQueryFilters(EMPTY_FILTERS, "", "open", "game"))
					.queryKey,
			),
		)
		expect(
			hashKey(myLiveCallsQuery({ result: "HIT", scope: "GAME" }).queryKey),
		).toBe(hashKey(myLiveCallsQuery({}).queryKey))
	})

	it("prefetches My Questions under its default sort", () => {
		expect(
			hashKey(
				myQuestionsQuery(
					{},
					DEFAULT_MY_QUESTIONS_SORT,
					DEFAULT_MY_LIST_DIRECTION,
				).queryKey,
			),
		).toBe(hashKey(myQuestionsQuery({}, "DATE", "DESC").queryKey))
	})
})
