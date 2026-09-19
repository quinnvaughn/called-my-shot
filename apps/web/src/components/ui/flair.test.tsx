import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Flair } from "./flair"

describe("Flair", () => {
	it("renders the icon and the label", () => {
		render(
			<Flair
				flair={{ icon: "BOS", label: "Boston Celtics", color: "#007A33" }}
			/>,
		)

		expect(screen.getByText("BOS")).toBeInTheDocument()
		expect(screen.getByText("Boston Celtics")).toBeInTheDocument()
	})

	// Team colors ship from ESPN, so the chip has to stay legible against
	// whatever hex it's handed - readableTextColor is what decides.
	it("puts dark text on a light color and light text on a dark one", () => {
		const { rerender } = render(
			<Flair flair={{ icon: "LAL", label: "Lakers", color: "#FDB927" }} />,
		)
		expect(screen.getByText("LAL")).toHaveStyle({ color: "#000000" })

		rerender(
			<Flair flair={{ icon: "BOS", label: "Celtics", color: "#007A33" }} />,
		)
		expect(screen.getByText("BOS")).toHaveStyle({ color: "#ffffff" })
	})
})
