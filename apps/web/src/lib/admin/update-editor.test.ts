import { describe, expect, it } from "vitest"
import { draftOf, failureMessage, fieldErrorsOf } from "./update-editor"

describe("failureMessage", () => {
	it("reads the first field error off a validation failure", () => {
		expect(
			failureMessage({
				__typename: "ValidationError",
				fieldErrors: [
					{ field: "title", message: "Too long" },
					{ field: "body", message: "Required" },
				],
			}),
		).toBe("Too long")
	})

	it("falls back when a validation failure carries no field errors", () => {
		expect(
			failureMessage({ __typename: "ValidationError", fieldErrors: [] }),
		).toBe("That didn't work.")
	})

	it("passes any other failure's message through", () => {
		expect(
			failureMessage({ __typename: "NotFoundError", message: "Gone" }),
		).toBe("Gone")
	})
})

describe("fieldErrorsOf", () => {
	it("keeps only the fields the editor has inputs for", () => {
		expect(
			fieldErrorsOf({
				__typename: "ValidationError",
				fieldErrors: [
					{ field: "summary", message: "Required" },
					{ field: "slug", message: "Taken" },
					{ field: null, message: "Something else" },
				],
			}),
		).toEqual({ summary: "Required" })
	})

	it("has no field errors for a failure that isn't validation", () => {
		expect(
			fieldErrorsOf({ __typename: "AuthorizationError", message: "No" }),
		).toEqual({})
	})
})

describe("draftOf", () => {
	it("starts a new update empty", () => {
		expect(draftOf(null)).toEqual({
			title: "",
			summary: "",
			body: "",
			coverImageKey: null,
			coverImageUrl: null,
		})
	})
})
