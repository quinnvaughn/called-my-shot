import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { searchPromptsQuery } from "#/graphql/posts/composer-queries"
import { choiceList } from "./composer-styles"
import { PromptRow } from "./prompt-row"

type Props = {
	query: string
	onChoose: (code: string) => void
}

// Every prompt matching what was typed, across every league and team, most
// answered first.
export function PromptResults({ query, onChoose }: Props) {
	const { data, isPending } = useQuery({
		...searchPromptsQuery({ query, first: 15 }),
		placeholderData: keepPreviousData,
	})
	const prompts = data?.searchPrompts ?? []

	return (
		<VStack gap="2" alignItems="stretch">
			{!isPending && prompts.length === 0 && (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					Nobody has asked that yet. New prompt starts it.
				</p>
			)}
			{prompts.length > 0 && (
				<div className={choiceList}>
					{prompts.map((prompt) => (
						<PromptRow key={prompt.id} prompt={prompt} onChoose={onChoose} />
					))}
				</div>
			)}
		</VStack>
	)
}
