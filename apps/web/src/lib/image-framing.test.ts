import { describe, expect, it } from "vitest"
import { imageFraming } from "./image-framing"

describe("imageFraming", () => {
	it("zooms NHL logos about their center", () => {
		expect(
			imageFraming("https://assets.nhle.com/logos/nhl/svg/TOR_dark.svg"),
		).toEqual({ transform: "scale(1.5)" })
	})

	it("zooms NHL headshots about the head", () => {
		expect(
			imageFraming("https://assets.nhle.com/mugs/nhl/20262027/TOR/8476927.png"),
		).toEqual({ transform: "scale(1.5)", transformOrigin: "50% 30%" })
	})

	it("leaves every other league's images alone", () => {
		expect(
			imageFraming(
				"https://cdn.nba.com/logos/nba/1610612738/primary/D/logo.svg",
			),
		).toBeUndefined()
		expect(
			imageFraming("https://static.www.nfl.com/league/api/clubs/logos/KC.svg"),
		).toBeUndefined()
	})
})
