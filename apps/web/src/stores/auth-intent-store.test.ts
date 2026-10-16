import { afterEach, describe, expect, it, vi } from "vitest"
import { saveAuthIntent, takeAuthIntent } from "./auth-intent-store"

afterEach(() => {
	vi.restoreAllMocks()
	window.sessionStorage.clear()
})

describe("auth intent", () => {
	it("hands back what was saved", () => {
		saveAuthIntent({ kind: "create_group", name: "Sunday Crew" })
		expect(takeAuthIntent()).toEqual({
			kind: "create_group",
			name: "Sunday Crew",
		})
	})

	it("is gone after it's taken once", () => {
		saveAuthIntent({ kind: "join_group", code: "ABC234" })
		takeAuthIntent()
		expect(takeAuthIntent()).toBeNull()
	})

	it("drops an earlier intent when the next trip carries none", () => {
		saveAuthIntent({ kind: "join_group", code: "ABC234" })
		saveAuthIntent(null)
		expect(takeAuthIntent()).toBeNull()
	})

	it("ignores a stored value it doesn't recognize", () => {
		window.sessionStorage.setItem(
			"cms.authIntent.v1",
			JSON.stringify({ kind: "delete_everything" }),
		)
		expect(takeAuthIntent()).toBeNull()
	})

	it("survives blocked storage", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		expect(() =>
			saveAuthIntent({ kind: "create_group", name: "Sunday Crew" }),
		).not.toThrow()
		expect(takeAuthIntent()).toBeNull()
	})
})
