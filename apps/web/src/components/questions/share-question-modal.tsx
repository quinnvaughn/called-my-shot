import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { FormError } from "#/components/ui/form-error"
import { GroupLogo } from "#/components/ui/group-logo"
import { Modal } from "#/components/ui/modal"
import { graphql } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import {
	PinQuestionToGroupDocument,
	ShareQuestionToGroupDocument,
	UnpinQuestionFromGroupDocument,
} from "#/graphql/mutations/groups"
import { questionDetailQuery } from "#/graphql/queries/question"
import { gqlQueryOptions } from "#/graphql/query-options"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
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

const labelClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
})

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
					// Scoped to the three operations a new share actually changes,
					// rather than a bare invalidateQueries() refetching the entire
					// cache after every share.
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: ["SharedQuestions"] }),
						queryClient.invalidateQueries({ queryKey: ["GroupDetail"] }),
						queryClient.invalidateQueries({
							queryKey: questionDetailQuery(questionId).queryKey,
						}),
					])
				})
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					{ __typename: "ValidationError" },
					async (r) => {
						setError(r.message)
					},
				)
				.exhaustive()
		} finally {
			setPendingGroupId(null)
		}
	}

	// A pin also shares, so both land in the group's feeds and settings.
	async function refreshAfterPin() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["SharedQuestions"] }),
			queryClient.invalidateQueries({ queryKey: ["GroupDetail"] }),
			queryClient.invalidateQueries({ queryKey: ["GroupSettings"] }),
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
					await refreshAfterPin()
				})
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					{ __typename: "ValidationError" },
					async (r) => {
						setError(r.message)
					},
				)
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
					<span className={labelClass}>Link</span>
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
						<span className={labelClass}>Share to a group</span>
						{isLoading ? (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.subtle",
								})}
							>
								Loading your groups…
							</span>
						) : groups.length === 0 ? (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
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

function GroupShareRow({
	name,
	logoUrl,
	memberCount,
	alreadyShared,
	pending,
	disabled,
	onShare,
	pin,
}: {
	name: string
	logoUrl: string | null
	memberCount: number
	alreadyShared: boolean
	pending: boolean
	disabled: boolean
	onShare: () => void
	// Admins only: pins the question to the top of the group page, or
	// unpins it.
	pin: { pinned: boolean; onToggle: () => void } | null
}) {
	return (
		<HStack
			justify="space-between"
			gap="3"
			className={css({
				paddingBlock: "2.5",
				borderBottom: "1px solid {colors.border.default}",
				_last: { borderBottom: "none" },
			})}
		>
			<HStack gap="2.5" alignItems="center" minWidth="0">
				<GroupLogo size="sm" name={name} src={logoUrl} />
				<VStack
					gap="0.5"
					alignItems="flex-start"
					className={css({ minWidth: 0 })}
				>
					<span
						className={css({
							fontSize: "sm",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							maxWidth: "full",
						})}
					>
						{name}
					</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						{memberCount} {pluralize(memberCount, "member")}
					</span>
				</VStack>
			</HStack>
			<HStack gap="2" flexShrink="0">
				{pin && (
					<Button
						variant={pin.pinned ? "ghost" : "outline"}
						size="sm"
						disabled={disabled}
						onClick={pin.onToggle}
					>
						{pin.pinned ? "Unpin" : "Pin"}
					</Button>
				)}
				{alreadyShared ? (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "success.default",
							whiteSpace: "nowrap",
						})}
					>
						✓ Shared
					</span>
				) : (
					<Button
						variant="outline"
						size="sm"
						loading={pending}
						disabled={disabled}
						onClick={onShare}
					>
						Share
					</Button>
				)}
			</HStack>
		</HStack>
	)
}
