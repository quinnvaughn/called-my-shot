import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { GroupShareRow } from "#/components/questions/group-share-row"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { ApiError } from "#/graphql/api-error"
import { graphql } from "#/graphql/generated"
import { SharedQuestionsDocument } from "#/graphql/generated/graphql"
import {
	invalidateGroupBoards,
	PinQuestionToGroupDocument,
	ShareQuestionToGroupDocument,
	UnpinQuestionFromGroupDocument,
} from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryKey, gqlQueryOptions } from "#/graphql/query-options"
import { questionDetailQuery } from "#/graphql/questions/queries"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { questionPath } from "#/lib/slug"

// Deliberately not MyGroupsDocument - that one spreads GroupCard_group, which
// pulls the whole card's worth of leaderboard/member data for a list that
// only ever renders a name here.
const ShareTargetGroupsDocument = graphql(`
	query ShareTargetGroups {
		myGroups {
			id
			name
			logoUrl
			memberCount
			viewerIsAdmin
			trackedLeagues {
				id
			}
		}
	}
`)

// staleTime keeps reopening the sheet off the network entirely.
const shareTargetGroupsQuery = () =>
	gqlQueryOptions(ShareTargetGroupsDocument, {}, { staleTime: 5 * 60_000 })

type Props = {
	questionId: string
	questionTitle: string
	questionLeague: { id: string; abbreviation: string }
	// Group ids that already have this question in their Shared tab, from the
	// question's own viewerSharedGroupIds. Seeded rather than derived so the
	// list renders its "Shared" rows on first paint instead of after a
	// round-trip.
	sharedGroupIds: string[]
	// Group ids that have this question pinned, from viewerPinnedGroupIds.
	// Seeded for the same reason as sharedGroupIds.
	pinnedGroupIds: string[]
	// Signed-out viewers still get the link half of this sheet - only the
	// group list needs an account behind it.
	canShareToGroup: boolean
	// Whether the question can still be called. Only then can an admin pin
	// it; unpinning stays available either way.
	canPin: boolean
}

export function ShareQuestionModal({
	questionId,
	questionTitle,
	questionLeague,
	sharedGroupIds,
	pinnedGroupIds,
	canShareToGroup,
	canPin,
}: Props) {
	const queryClient = useQueryClient()
	const shareToGroup = useGqlMutation(ShareQuestionToGroupDocument)
	const pinToGroup = useGqlMutation(PinQuestionToGroupDocument)
	const unpinFromGroup = useGqlMutation(UnpinQuestionFromGroupDocument)
	const [shared, setShared] = useState<Set<string>>(
		() => new Set(sharedGroupIds),
	)
	const [pinned, setPinned] = useState<Set<string>>(
		() => new Set(pinnedGroupIds),
	)
	const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const { data, isLoading } = useQuery({
		...shareTargetGroupsQuery(),
		enabled: canShareToGroup,
	})
	const allGroups = data?.myGroups ?? []
	// shareQuestionToGroup refuses a group that doesn't track this question's
	// league, so those aren't offered. An empty trackedLeagues tracks all.
	const groups = allGroups.filter(
		(group) =>
			group.trackedLeagues.length === 0 ||
			group.trackedLeagues.some((league) => league.id === questionLeague.id),
	)

	// The slug form, since this is the url people actually paste - the bare
	// id would just bounce the recipient through a redirect to get here.
	const sharePath = questionPath({ id: questionId, title: questionTitle })

	async function handleShareToGroup(groupId: string) {
		setError(null)
		setPendingGroupId(groupId)
		try {
			const result = (await shareToGroup.mutateAsync({ groupId, questionId }))
				?.shareQuestionToGroup
			if (!result) {
				setError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "QuestionSharePayload" }, async () => {
					track("question_shared_to_group", { questionId, groupId })
					setShared((current) => new Set(current).add(groupId))
					await refreshGroup(groupId)
				})
				.with(ApiError, { __typename: "ValidationError" }, async (r) => {
					setError(r.message)
				})
				.exhaustive()
		} finally {
			setPendingGroupId(null)
		}
	}

	// A share lands in the group's feeds and on this question's page. A pin
	// also shares, and shows in the group's settings too.
	async function refreshGroup(groupId: string) {
		await Promise.all([
			invalidateGroupBoards(queryClient, groupId),
			queryClient.invalidateQueries({
				queryKey: gqlQueryKey(SharedQuestionsDocument, { groupId }),
			}),
			queryClient.invalidateQueries({
				queryKey: questionDetailQuery(questionId).queryKey,
			}),
		])
	}

	async function handleTogglePin(groupId: string) {
		setError(null)
		setPendingGroupId(groupId)
		const unpinning = pinned.has(groupId)
		try {
			const result = unpinning
				? (await unpinFromGroup.mutateAsync({ groupId, questionId }))
						?.unpinQuestionFromGroup
				: (await pinToGroup.mutateAsync({ groupId, questionId }))
						?.pinQuestionToGroup
			if (!result) {
				setError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "GroupPayload" }, async () => {
					setPinned((current) => {
						const next = new Set(current)
						if (unpinning) next.delete(groupId)
						else next.add(groupId)
						return next
					})
					if (!unpinning) {
						setShared((current) => new Set(current).add(groupId))
					}
					await refreshGroup(groupId)
				})
				.with(ApiError, { __typename: "ValidationError" }, async (r) => {
					setError(r.message)
				})
				.exhaustive()
		} finally {
			setPendingGroupId(null)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Share this question</Modal.Title>
			<VStack gap="5" alignItems="stretch">
				<VStack gap="2" alignItems="stretch">
					<span className={css({ textStyle: "label", color: "fg.subtle" })}>
						Link
					</span>
					<CopyLinkRow
						url={SITE_ORIGIN + sharePath}
						campaign="question"
						displayUrl={`${SITE_HOST}${sharePath}`}
						shareTitle={questionTitle}
						onCopied={() =>
							track("question_link_shared", { questionId, method: "clipboard" })
						}
						onNativeShared={() =>
							track("question_link_shared", { questionId, method: "native" })
						}
					/>
				</VStack>

				{canShareToGroup && (
					<VStack gap="2" alignItems="stretch">
						<span className={css({ textStyle: "label", color: "fg.subtle" })}>
							Share to a group
						</span>
						{isLoading ? (
							<span
								className={css({
									textStyle: "metaLg",
									color: "fg.subtle",
								})}
							>
								Loading your groups…
							</span>
						) : groups.length === 0 ? (
							<span
								className={css({
									textStyle: "metaLg",
									color: "fg.subtle",
								})}
							>
								{allGroups.length === 0
									? "You're not in any groups yet."
									: `None of your groups track ${questionLeague.abbreviation} questions.`}
							</span>
						) : (
							<VStack gap="0" alignItems="stretch">
								{groups.map((group) => (
									<GroupShareRow
										key={group.id}
										name={group.name}
										logoUrl={group.logoUrl ?? null}
										memberCount={group.memberCount}
										alreadyShared={shared.has(group.id)}
										pending={pendingGroupId === group.id}
										disabled={pendingGroupId !== null}
										onShare={() => handleShareToGroup(group.id)}
										pin={
											group.viewerIsAdmin && (canPin || pinned.has(group.id))
												? {
														pinned: pinned.has(group.id),
														onToggle: () => handleTogglePin(group.id),
													}
												: null
										}
									/>
								))}
							</VStack>
						)}
					</VStack>
				)}

				<FormError message={error} />
			</VStack>
		</Modal>
	)
}
