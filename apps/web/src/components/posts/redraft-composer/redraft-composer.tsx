import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { sidebarGroupsQuery } from "#/graphql/groups/queries"
import { composerRedraftQuery } from "#/graphql/posts/composer-queries"
import { AlreadyAnsweredNotice } from "../rushmore-composer/already-answered-notice"
import { AudienceSelect } from "../rushmore-composer/audience-select"
import { stepHeading } from "../rushmore-composer/composer-styles"
import { ChosenClassSummary } from "./chosen-class-summary"
import { ClassSearch } from "./class-search"
import { RedraftForm } from "./redraft-form"

type Props = {
	// The class being redrafted, from ?prompt=. Null until one is chosen.
	classCode: string | null
	// From ?group=, when the composer was opened from a group.
	presetGroupId: string | null
	onClassChange: (code: string | null) => void
}

// Making a redraft: choose the class and who sees it, fill its slots, then
// post.
export function RedraftComposer({
	classCode,
	presetGroupId,
	onClassChange,
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
		...composerRedraftQuery(classCode ?? "", groupId),
		enabled: !!classCode,
		// Switching who sees it re-reads the viewer's redraft for that
		// audience; the class stays on screen meanwhile.
		placeholderData: keepPreviousData,
	})
	// The kept data can be another class's while a newly chosen one loads.
	const draftClass =
		classCode &&
		data?.redraftPrompt?.code.toLowerCase() === classCode.toLowerCase()
			? data.redraftPrompt
			: null
	const loading = !draftClass && (isPending || isPlaceholderData)

	return (
		<VStack gap="8" alignItems="stretch">
			<VStack gap="3" alignItems="stretch">
				<h2 className={stepHeading}>1. Which draft</h2>
				{!classCode ? (
					<ClassSearch onChoose={onClassChange} />
				) : loading ? (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						Loading the class
					</p>
				) : !draftClass ? (
					<VStack gap="3" alignItems="flex-start">
						<p className={css({ fontSize: "sm", color: "fg.muted" })}>
							That draft class isn't here.
						</p>
						<Button variant="outline" onClick={() => onClassChange(null)}>
							Choose another class
						</Button>
					</VStack>
				) : (
					<>
						<ChosenClassSummary
							draftClass={draftClass}
							onChange={() => onClassChange(null)}
						/>
						<AudienceSelect
							kind="redraft"
							groups={groups}
							value={groupId}
							onChange={setGroupId}
						/>
					</>
				)}
			</VStack>
			{draftClass?.viewerAnswer && (
				<AlreadyAnsweredNotice
					kind="redraft"
					postId={draftClass.viewerAnswer.id}
					audience={audience}
				/>
			)}
			{draftClass && (
				// Hidden rather than dropped while the chosen audience already has
				// one, so switching to another audience keeps the picks.
				<div hidden={!!draftClass.viewerAnswer}>
					<RedraftForm
						// Picks belong to one class, so a new class starts them over.
						key={draftClass.id}
						draftClass={draftClass}
						groupId={groupId}
						audience={audience}
					/>
				</div>
			)}
		</VStack>
	)
}
