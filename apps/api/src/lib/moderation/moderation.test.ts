import { afterEach, describe, expect, it } from "vitest"
import { moderateText, setModerationProvider } from "."
import { checkLocally } from "./local"

const slur = Buffer.from("ZmFnZ290", "base64").toString("utf8")

describe("checkLocally", () => {
	it("lets profanity and trash talk through", () => {
		for (const text of [
			"You absolute clown, that call was dogshit",
			"lmao imagine taking the under. fuck off",
			"They'll kill you on the boards every time",
			"LeBron dropped 41 and had a 75 yard drive to watch",
		]) {
			expect(checkLocally(text, "strict")).toEqual({ ok: true })
		}
	})

	it("blocks slurs, including stretched, spaced and leetspeak spellings", () => {
		for (const text of [
			`you ${slur}`,
			`${slur.replace("a", "aaa")}s everywhere`,
			slur.split("").join(" "),
			slur.replace("a", "4").replace("o", "0"),
		]) {
			expect(checkLocally(text, "standard")).toEqual({
				ok: false,
				category: "hate",
			})
		}
	})

	it("blocks first-person threats", () => {
		expect(checkLocally("I'm gonna find you", "standard")).toEqual({
			ok: false,
			category: "threat",
		})
		expect(checkLocally("i know where you live", "standard").ok).toBe(false)
		expect(checkLocally("kys", "standard").ok).toBe(false)
	})

	it("blocks contact details and addresses", () => {
		for (const text of [
			"call me 555-867-5309",
			"his email is jay@example.com",
			"he lives at 1234 Elm Street",
		]) {
			expect(checkLocally(text, "standard")).toEqual({
				ok: false,
				category: "personal_info",
			})
		}
	})

	it("holds strangers to a wider list", () => {
		const word = Buffer.from("cmV0YXJk", "base64").toString("utf8")
		expect(checkLocally(`what a ${word}`, "standard").ok).toBe(true)
		expect(checkLocally(`what a ${word}`, "strict").ok).toBe(false)
	})
})

describe("moderateText", () => {
	afterEach(() => setModerationProvider(null))

	it("asks the provider only once the local check passes", async () => {
		const seen: string[] = []
		setModerationProvider({
			check: async (text) => {
				seen.push(text)
				return { ok: false, category: "harassment" }
			},
		})
		expect(
			await moderateText(`you ${slur}`, { strictness: "standard" }),
		).toEqual({
			ok: false,
			category: "hate",
		})
		expect(await moderateText("fine", { strictness: "standard" })).toEqual({
			ok: false,
			category: "harassment",
		})
		expect(seen).toEqual(["fine"])
	})
})
