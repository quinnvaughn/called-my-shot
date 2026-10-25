import { useState } from "react"
import { FiPlus, FiSearch } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { TextInput } from "#/components/ui/text-input"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { NewPromptForm } from "./new-prompt-form"
import { PromptResults } from "./prompt-results"
import { PromptSuggestions } from "./prompt-suggestions"

// Step one: what the Rushmore is of. One search over every prompt, a team's
// franchise Rushmore or one someone made, in any league or none. New prompt
// beside it starts one from whatever's typed.
export function PromptChooser({
	onChoose,
}: {
	onChoose: (code: string) => void
}) {
	const [text, setText] = useState("")
	// The title a new prompt starts from, once the viewer chooses to start one.
	const [starting, setStarting] = useState<string | null>(null)
	const query = useDebouncedValue(text.trim(), 250)

	if (starting !== null) {
		return (
			<NewPromptForm
				initialTitle={starting}
				onBack={() => setStarting(null)}
				onChoose={onChoose}
			/>
		)
	}

	return (
		<VStack gap="4" alignItems="stretch">
			<HStack gap="2" alignItems="stretch">
				<TextInput className={css({ flex: 1, minWidth: 0 })}>
					<TextInput.Group>
						<TextInput.Icon>
							<FiSearch size={16} />
						</TextInput.Icon>
						<TextInput.Field
							type="search"
							autoComplete="off"
							aria-label="Search Rushmore prompts"
							placeholder="Celtics, point guards, Boston sports"
							value={text}
							onChange={(event) => setText(event.target.value)}
						/>
					</TextInput.Group>
				</TextInput>
				<Button variant="outline" onClick={() => setStarting(text.trim())}>
					<FiPlus size={16} aria-hidden />
					New prompt
				</Button>
			</HStack>
			{query ? (
				<PromptResults query={query} onChoose={onChoose} />
			) : (
				<PromptSuggestions onChoose={onChoose} />
			)}
		</VStack>
	)
}
