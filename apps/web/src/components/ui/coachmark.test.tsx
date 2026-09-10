import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { Coachmark } from "./coachmark"

// jsdom implements neither of these. scrollIntoView is called every time a step
// changes anchor, and getBoundingClientRect returns all-zeros, which is fine:
// the component only needs a rect object to exist before it renders, and the
// placement assertions below set their own numbers.
beforeAll(() => {
	Element.prototype.scrollIntoView = vi.fn()
})

function renderCoachmark(
	props: Partial<Parameters<typeof Coachmark>[0]> = {},
	rect: Partial<DOMRect> = {},
) {
	const anchorRef = createRef<HTMLElement>()
	const onNext = vi.fn()
	const onSkip = vi.fn()

	function Harness() {
		return (
			<div>
				{/* Stands in for whatever form field a real step points at. */}
				<div ref={anchorRef as React.Ref<HTMLDivElement>} />
				<Coachmark
					anchorRef={anchorRef}
					title="Conviction is your stake"
					body="1 to 100."
					step={0}
					total={4}
					onNext={onNext}
					onSkip={onSkip}
					{...props}
				/>
			</div>
		)
	}

	const view = render(<Harness />)
	// Applied after the ref exists but before assertions, so a test can put the
	// anchor somewhere specific on a notional viewport.
	if (anchorRef.current) {
		anchorRef.current.getBoundingClientRect = () =>
			({ top: 0, left: 0, width: 0, height: 0, ...rect }) as DOMRect
	}
	return { ...view, onNext, onSkip }
}

describe("Coachmark", () => {
	it("shows which step of the walkthrough this is", () => {
		renderCoachmark()

		expect(screen.getByText("Step 1 of 4")).toBeInTheDocument()
		expect(screen.getByText("Conviction is your stake")).toBeInTheDocument()
	})

	it("advances on Next", async () => {
		const { onNext } = renderCoachmark()

		await userEvent.click(screen.getByRole("button", { name: "Next" }))

		expect(onNext).toHaveBeenCalledOnce()
	})

	it("labels the last step's button as an ending, not a continuation", () => {
		renderCoachmark({ step: 3, total: 4 })

		expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull()
	})

	it("ends the tour on Escape, so it is never a trap", async () => {
		const { onSkip } = renderCoachmark()

		await userEvent.keyboard("{Escape}")

		expect(onSkip).toHaveBeenCalledOnce()
	})

	it("ends the tour from the End tour control", async () => {
		const { onSkip } = renderCoachmark()

		await userEvent.click(screen.getByRole("button", { name: "End tour" }))

		expect(onSkip).toHaveBeenCalledOnce()
	})

	it("leads with the action instead of a Next on a gated step", () => {
		const onSkipStep = vi.fn()
		renderCoachmark({
			onNext: undefined,
			hint: "Pick one to continue",
			onSkipStep,
		})

		// No prominent Next inviting people to skim past the one thing the step
		// is asking for.
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull()
		expect(screen.getByText("Pick one to continue")).toBeInTheDocument()
	})

	it("never traps someone on a gated step", async () => {
		const onSkipStep = vi.fn()
		renderCoachmark({
			onNext: undefined,
			hint: "Pick one to continue",
			onSkipStep,
		})

		await userEvent.click(screen.getByRole("button", { name: "Skip" }))

		expect(onSkipStep).toHaveBeenCalledOnce()
	})

	it("offers Back once past the first step, and never on it", () => {
		const { unmount } = renderCoachmark({ step: 0, onBack: undefined })
		expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
		unmount()

		const onBack = vi.fn()
		renderCoachmark({ step: 1, onBack })
		expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument()
	})

	it("steps backward on Back", async () => {
		const onBack = vi.fn()
		renderCoachmark({ step: 1, onBack })

		await userEvent.click(screen.getByRole("button", { name: "Back" }))

		expect(onBack).toHaveBeenCalledOnce()
	})

	it("names the step it is explaining for screen readers", () => {
		renderCoachmark()

		expect(
			screen.getByRole("dialog", { name: "Conviction is your stake" }),
		).toBeInTheDocument()
	})
})
