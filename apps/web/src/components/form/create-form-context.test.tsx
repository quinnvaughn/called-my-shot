import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { useForm } from "#/lib/form/use-form"
import { createFormContext } from "./create-form-context"

const schema = z.object({
	name: z.string().min(1, "Name is required"),
	count: z.number().min(1, "Too few").optional(),
	tags: z.array(z.string()),
	years: z.array(z.number()),
	mode: z.enum(["total", "per_game"]).optional(),
	enabled: z.boolean().default(false),
})

const {
	FormProvider,
	useWatch,
	useSetValue,
	TextField,
	NumberField,
	MultiSelectField,
	NumberMultiSelectField,
	ChipField,
	ToggleField,
} = createFormContext<typeof schema>()

function Harness({
	children,
	onSubmit,
}: {
	children: ReactNode
	onSubmit?: (values: z.output<typeof schema>) => void
}) {
	const form = useForm({
		schema,
		defaultValues: {
			name: "",
			count: undefined,
			tags: [],
			years: [],
			mode: undefined,
			enabled: false,
		},
		onSubmit: async (values) => onSubmit?.(values),
	})
	return (
		<FormProvider form={form}>
			<form onSubmit={form.handleSubmit}>
				{children}
				<button type="submit">Submit</button>
			</form>
		</FormProvider>
	)
}

describe("createFormContext", () => {
	it("throws a named error when a bound component is used outside the provider", () => {
		// React logs the thrown render error; silence it so the suite output stays
		// readable rather than carrying a stack for an error we're asserting on.
		const spy = vi.spyOn(console, "error").mockImplementation(() => {})
		expect(() => render(<TextField name="name" label="Name" />)).toThrow(
			/must be rendered inside <FormProvider>/,
		)
		spy.mockRestore()
	})

	it("reads and writes the form value through context, with no form prop", async () => {
		const user = userEvent.setup()
		render(
			<Harness>
				<TextField name="name" label="Name" />
			</Harness>,
		)

		const input = screen.getByLabelText("Name")
		await user.type(input, "Shohei")
		expect(input).toHaveValue("Shohei")
	})

	it("surfaces a field error only once the field has been touched", async () => {
		const user = userEvent.setup()
		render(
			<Harness>
				<TextField name="name" label="Name" required />
			</Harness>,
		)

		expect(screen.queryByText("Name is required")).not.toBeInTheDocument()

		// By role, not label text: a required field's label ends with an
		// aria-hidden "*", which getByLabelText matches on but the accessible
		// name correctly excludes.
		const input = screen.getByRole("textbox", { name: "Name" })

		// The value is already invalid; blurring is what marks it touched.
		await user.click(input)
		await user.tab()

		expect(await screen.findByText("Name is required")).toBeInTheDocument()
	})

	it("fires onValueChange after the value has landed", async () => {
		const user = userEvent.setup()
		const seen: string[] = []

		function Probe() {
			const name = useWatch("name")
			return (
				<>
					<TextField
						name="name"
						label="Name"
						onValueChange={() => seen.push(name)}
					/>
					<span data-testid="current">{name}</span>
				</>
			)
		}

		render(
			<Harness>
				<Probe />
			</Harness>,
		)
		await user.type(screen.getByLabelText("Name"), "ab")
		expect(screen.getByTestId("current")).toHaveTextContent("ab")
		// The callback exists so a side effect can read the *new* value from a
		// separate watch, which is what the rookie-only toggle depends on.
		expect(seen).toHaveLength(2)
	})
})

describe("NumberField", () => {
	it("submits undefined rather than 0 when emptied", async () => {
		const user = userEvent.setup()
		const onSubmit = vi.fn()
		render(
			<Harness onSubmit={onSubmit}>
				<TextField name="name" label="Name" />
				<NumberField name="count" label="Count" />
			</Harness>,
		)

		await user.type(screen.getByLabelText("Name"), "x")
		await user.type(screen.getByLabelText("Count"), "5")
		await user.clear(screen.getByLabelText("Count"))
		await user.click(screen.getByRole("button", { name: "Submit" }))

		expect(onSubmit).toHaveBeenCalledTimes(1)
		expect(onSubmit.mock.calls[0][0].count).toBeUndefined()
	})

	it("submits a number, not a string", async () => {
		const user = userEvent.setup()
		const onSubmit = vi.fn()
		render(
			<Harness onSubmit={onSubmit}>
				<TextField name="name" label="Name" />
				<NumberField name="count" label="Count" />
			</Harness>,
		)

		await user.type(screen.getByLabelText("Name"), "x")
		await user.type(screen.getByLabelText("Count"), "12")
		await user.click(screen.getByRole("button", { name: "Submit" }))

		expect(onSubmit.mock.calls[0][0].count).toBe(12)
	})
})

describe("ChipField", () => {
	it("marks the selected chip pressed and writes the value", async () => {
		const user = userEvent.setup()
		render(
			<Harness>
				<ChipField
					name="mode"
					label="Total or per game"
					options={[
						["total", "Total"],
						["per_game", "Per game"],
					]}
				/>
			</Harness>,
		)

		const total = screen.getByRole("button", { name: "Total" })
		const perGame = screen.getByRole("button", { name: "Per game" })
		expect(total).toHaveAttribute("aria-pressed", "false")

		await user.click(perGame)
		expect(perGame).toHaveAttribute("aria-pressed", "true")
		expect(total).toHaveAttribute("aria-pressed", "false")
	})
})

describe("ToggleField", () => {
	it("flips the value and reports it to onValueChange", async () => {
		const user = userEvent.setup()
		const seen: boolean[] = []
		render(
			<Harness>
				<ToggleField
					name="enabled"
					label="Enabled"
					onValueChange={(next) => seen.push(next)}
				/>
			</Harness>,
		)

		const toggle = screen.getByRole("switch", { name: "Enabled" })
		expect(toggle).toHaveAttribute("aria-checked", "false")
		await user.click(toggle)
		expect(toggle).toHaveAttribute("aria-checked", "true")
		expect(seen).toEqual([true])
	})
})

describe("MultiSelectField", () => {
	it("summarises the picks on the trigger, falling back to a count past three", async () => {
		const user = userEvent.setup()

		function Probe() {
			const setValue = useSetValue()
			return (
				<>
					<MultiSelectField
						name="tags"
						label="Tags"
						emptyLabel="Whole league"
						options={["AL", "NL", "AAA", "AAAA"].map((v) => ({
							value: v,
							label: v,
						}))}
					/>
					<button type="button" onClick={() => setValue("tags", ["AL", "NL"])}>
						pick two
					</button>
					<button
						type="button"
						onClick={() => setValue("tags", ["AL", "NL", "AAA", "AAAA"])}
					>
						pick four
					</button>
				</>
			)
		}

		render(
			<Harness>
				<Probe />
			</Harness>,
		)

		expect(screen.getByText("Whole league")).toBeInTheDocument()

		await user.click(screen.getByRole("button", { name: "pick two" }))
		expect(screen.getByText("AL, NL")).toBeInTheDocument()

		await user.click(screen.getByRole("button", { name: "pick four" }))
		expect(screen.getByText("4 selected")).toBeInTheDocument()
	})
})

describe("NumberMultiSelectField", () => {
	it("round-trips numbers through the string-only MultiSelect", async () => {
		const user = userEvent.setup()
		const onSubmit = vi.fn()

		function Probe() {
			const setValue = useSetValue()
			return (
				<>
					<NumberMultiSelectField
						name="years"
						label="Years"
						emptyLabel="Any"
						options={[0, 1, 2].map((v) => ({ value: v, label: String(v) }))}
					/>
					<button type="button" onClick={() => setValue("years", [0, 2])}>
						pick
					</button>
				</>
			)
		}

		render(
			<Harness onSubmit={onSubmit}>
				<TextField name="name" label="Name" />
				<Probe />
			</Harness>,
		)

		await user.type(screen.getByLabelText("Name"), "x")
		await user.click(screen.getByRole("button", { name: "pick" }))
		await user.click(screen.getByRole("button", { name: "Submit" }))

		// Numbers back out, not the strings MultiSelect works in.
		expect(onSubmit.mock.calls[0][0].years).toEqual([0, 2])
	})
})
