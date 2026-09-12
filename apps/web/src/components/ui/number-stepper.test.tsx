import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { NumberStepper } from "./number-stepper"

const COUNTING_STEPS = [1, 5, 10, 25]
const RATE_STEPS = [0.005, 0.01, 0.05]

// The stepper is controlled, so every test drives it through a real state
// holder rather than asserting on an onChange spy - what matters is the value
// that survives a round trip back into the input.
function Harness({
	initial,
	snap = "half",
	min = 0.5,
	stepSizes = COUNTING_STEPS,
}: {
	initial?: number
	snap?: "half" | "none"
	min?: number
	stepSizes?: readonly number[]
}) {
	const [value, setValue] = useState<number | undefined>(initial)
	return (
		<NumberStepper
			ariaLabel="Number"
			value={value}
			onChange={setValue}
			stepSizes={stepSizes}
			snap={snap}
			min={min}
		/>
	)
}

function input() {
	return screen.getByRole("textbox", { name: "Number" })
}

describe("NumberStepper: a counting line can never be a whole number", () => {
	it("keeps the half point when stepping up and down", async () => {
		const user = userEvent.setup()
		render(<Harness initial={24.5} />)

		await user.click(screen.getByRole("button", { name: "Increase number" }))
		expect(input()).toHaveValue("25.5")
		await user.click(screen.getByRole("button", { name: "Decrease number" }))
		await user.click(screen.getByRole("button", { name: "Decrease number" }))
		expect(input()).toHaveValue("23.5")
	})

	it("keeps the half point across every step size", async () => {
		const user = userEvent.setup()
		render(<Harness initial={24.5} />)

		for (const size of COUNTING_STEPS) {
			await user.click(screen.getByRole("button", { name: `±${size}` }))
			await user.click(screen.getByRole("button", { name: "Increase number" }))
		}
		// 24.5 + 1 + 5 + 10 + 25, still sitting on a half point.
		expect(input()).toHaveValue("65.5")
	})

	it("snaps a typed whole number onto the half point at blur", async () => {
		const user = userEvent.setup()
		render(<Harness initial={24.5} />)

		await user.clear(input())
		await user.type(input(), "224")
		await user.tab()
		expect(input()).toHaveValue("224.5")
	})

	it("snaps down rather than up, so it never rounds onto a whole number", async () => {
		const user = userEvent.setup()
		render(<Harness initial={24.5} />)

		await user.clear(input())
		await user.type(input(), "224.9")
		await user.tab()
		// Rounding to nearest would land on 225 - the exact value this forbids.
		expect(input()).toHaveValue("224.5")
	})

	it("clamps at the minimum instead of going negative", async () => {
		const user = userEvent.setup()
		render(<Harness initial={0.5} />)

		await user.click(screen.getByRole("button", { name: "±25" }))
		await user.click(screen.getByRole("button", { name: "Decrease number" }))
		expect(input()).toHaveValue("0.5")
	})

	it("leaves the field empty rather than committing a zero", async () => {
		const user = userEvent.setup()
		render(<Harness initial={24.5} />)

		await user.clear(input())
		await user.tab()
		// A required line left blank has to fail validation, not submit 0.
		expect(input()).toHaveValue("")
	})
})

describe("NumberStepper: a rate line keeps its decimals", () => {
	it("steps by the fine sizes without drifting", async () => {
		const user = userEvent.setup()
		render(
			<Harness initial={0.275} snap="none" min={0} stepSizes={RATE_STEPS} />,
		)

		await user.click(screen.getByRole("button", { name: "Increase number" }))
		// 0.275 + 0.005 in raw floating point is 0.28000000000000003.
		expect(input()).toHaveValue("0.28")

		await user.click(screen.getByRole("button", { name: "±0.01" }))
		await user.click(screen.getByRole("button", { name: "Increase number" }))
		expect(input()).toHaveValue("0.29")
	})

	it("does not snap a typed value onto a half point", async () => {
		const user = userEvent.setup()
		render(
			<Harness initial={0.275} snap="none" min={0} stepSizes={RATE_STEPS} />,
		)

		await user.clear(input())
		await user.type(input(), "3.85")
		await user.tab()
		expect(input()).toHaveValue("3.85")
	})

	it("lets a trailing decimal point survive being typed", async () => {
		const user = userEvent.setup()
		render(
			<Harness initial={0.275} snap="none" min={0} stepSizes={RATE_STEPS} />,
		)

		await user.clear(input())
		await user.type(input(), "0.")
		// Round-tripping through Number() would drop the dot and make the
		// fractional part impossible to ever type.
		expect(input()).toHaveValue("0.")
	})
})
