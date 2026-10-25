import { useQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import {
	composerFollowedTeamsQuery,
	searchPromptsQuery,
} from "#/graphql/posts/composer-queries"
import { choiceList, listLabel } from "./composer-styles"
import { PromptRow } from "./prompt-row"

const MOST_ANSWERED = 8

// What the chooser offers before anything is typed: the franchise Rushmores
// of the teams the viewer follows, then the prompts with the most Rushmores.
export function PromptSuggestions({
	onChoose,
}: {
	onChoose: (code: string) => void
}) {
	const { data: followsData } = useQuery(composerFollowedTeamsQuery)
	const { data: topData } = useQuery(
		searchPromptsQuery({ first: MOST_ANSWERED }),
	)
	const yourTeams = (followsData?.myFollows.teams ?? []).flatMap((team) =>
		team.rushmorePrompt
			? [{ ...team.rushmorePrompt, league: team.league, team }]
			: [],
	)
	const shown = new Set(yourTeams.map((prompt) => prompt.code))
	const mostAnswered = (topData?.searchPrompts ?? []).filter(
		(prompt) => prompt.answerCount > 0 && !shown.has(prompt.code),
	)

	return (
		<VStack gap="4" alignItems="stretch">
			{yourTeams.length > 0 && (
				<VStack gap="1.5" alignItems="stretch">
					<span className={listLabel}>Your teams</span>
					<div className={choiceList}>
						{yourTeams.map((prompt) => (
							<PromptRow key={prompt.id} prompt={prompt} onChoose={onChoose} />
						))}
					</div>
				</VStack>
			)}
			{mostAnswered.length > 0 && (
				<VStack gap="1.5" alignItems="stretch">
					<span className={listLabel}>Most answered</span>
					<div className={choiceList}>
						{mostAnswered.map((prompt) => (
							<PromptRow key={prompt.id} prompt={prompt} onChoose={onChoose} />
						))}
					</div>
				</VStack>
			)}
		</VStack>
	)
}
