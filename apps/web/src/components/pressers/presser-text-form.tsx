import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Textarea } from "#/components/ui/textarea"

type Props = {
	label: string
	placeholder: string
	max: number
	submitLabel: string
	// Resolves to an error to show, or null once it went through.
	onSubmit: (text: string) => Promise<string | null>
	// A second way to finish without writing anything (an answer's "No
	// comment").
	alternate?: { label: string; onSelect: () => Promise<string | null> }
}

// The one text box the presser uses for a statement, a question and an
// answer.
export function PresserTextForm({
	label,
	placeholder,
	max,
	submitLabel,
	onSubmit,
	alternate,
}: Props) {
	const [text, setText] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState<"submit" | "alternate" | null>(null)

	async function run(kind: "submit" | "alternate") {
		setError(null)
		setPending(kind)
		try {
			const result =
				kind === "submit"
					? await onSubmit(text.trim())
					: await (alternate?.onSelect() ?? Promise.resolve(null))
			setError(result)
			if (result === null) setText("")
		} finally {
			setPending(null)
		}
	}

	return (
		<VStack gap="2" alignItems="stretch">
			<Textarea error={error ?? undefined}>
				<Textarea.Label>{label}</Textarea.Label>
				<Textarea.Field
					placeholder={placeholder}
					maxLength={max}
					value={text}
					onChange={(e) => setText(e.target.value)}
				/>
				<Textarea.CharCount value={text} max={max} />
			</Textarea>
			<HStack justify="flex-end" gap="2">
				{alternate && (
					<Button
						variant="outline"
						size="sm"
						loading={pending === "alternate"}
						disabled={pending !== null}
						onClick={() => run("alternate")}
					>
						{alternate.label}
					</Button>
				)}
				<Button
					variant="solid"
					size="sm"
					loading={pending === "submit"}
					disabled={pending !== null || text.trim().length === 0}
					onClick={() => run("submit")}
				>
					{submitLabel}
				</Button>
			</HStack>
		</VStack>
	)
}
