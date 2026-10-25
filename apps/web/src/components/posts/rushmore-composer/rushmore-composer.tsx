import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { sidebarGroupsQuery } from "#/graphql/groups/queries"
import { composerPromptQuery } from "#/graphql/posts/composer-queries"
import { AlreadyAnsweredNotice } from "./already-answered-notice"
import { AudienceSelect } from "./audience-select"
import { ChosenPromptSummary } from "./chosen-prompt-summary"
import { stepHeading } from "./composer-styles"
import { PromptChooser } from "./prompt-chooser"
import { RushmoreForm } from "./rushmore-form"

type Props = {
	// The prompt being answered, from ?prompt=. Null until one is chosen.
	promptCode: string | null
	// From ?group=, when the composer was opened from a group.
	presetGroupId: string | null
	onPromptChange: (code: string | null) => void
}

// Making a Mount Rushmore: choose what it's of and who sees it, pick four
// players, then post.
export function RushmoreComposer({
	promptCode,
	presetGroupId,
	onPromptChange,
}: Props) {
	const { data: groupsData } = useQuery(sidebarGroupsQuery)
	const groups = groupsData?.myGroups ?? []
	const [chosenGroupId, setGroupId] = useState<string | null>(presetGroupId)
	// A preset group the viewer isn't in falls back to everyone once the
	// list is in.
	const groupId =
		groupsData && !groups.some((g) => g.id === chosenGroupId)
			? null
			: chosenGroupId
	const audience = groups.find((g) => g.id === groupId)?.name ?? "Everyone"

	const { data, isPending, isPlaceholderData } = useQuery({
		...composerPromptQuery(promptCode ?? "", groupId),
		enabled: !!promptCode,
		// Switching who sees it re-reads the viewer's answer for that
		// audience; the prompt stays on screen meanwhile.
		placeholderData: keepPreviousData,
	})
	// The kept data can be another prompt's while a newly chosen one loads.
	const prompt =
		promptCode && data?.prompt?.code.toLowerCase() === promptCode.toLowerCase()
			? data.prompt
			: null
	const loading = !prompt && (isPending || isPlaceholderData)

	return (
		<VStack gap="8" alignItems="stretch">
			<VStack gap="3" alignItems="stretch">
				<h2 className={stepHeading}>1. What it's of</h2>
				{!promptCode ? (
					<PromptChooser onChoose={onPromptChange} />
				) : loading ? (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						Loading the prompt
					</p>
				) : !prompt ? (
					<VStack gap="3" alignItems="flex-start">
						<p className={css({ fontSize: "sm", color: "fg.muted" })}>
							That prompt doesn't exist anymore.
						</p>
						<Button variant="outline" onClick={() => onPromptChange(null)}>
							Choose another prompt
						</Button>
					</VStack>
				) : (
					<>
						<ChosenPromptSummary
							prompt={prompt}
							onChange={() => onPromptChange(null)}
						/>
						<AudienceSelect
							groups={groups}
							value={groupId}
							onChange={setGroupId}
						/>
					</>
				)}
			</VStack>
			{prompt?.viewerAnswer && (
				<AlreadyAnsweredNotice
					postId={prompt.viewerAnswer.id}
					audience={audience}
				/>
			)}
			{prompt && (
				// Hidden rather than dropped while the chosen audience already has
				// one, so switching to another audience keeps the picks.
				<div hidden={!!prompt.viewerAnswer}>
					<RushmoreForm
						// Picks belong to one prompt's pool, so a new prompt starts
						// them over.
						key={prompt.id}
						promptId={prompt.id}
						color={prompt.color}
						groupId={groupId}
						audience={audience}
					/>
				</div>
			)}
		</VStack>
	)
}
