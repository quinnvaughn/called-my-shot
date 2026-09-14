import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Modal } from "#/components/ui/modal"
import { ToggleRow } from "#/components/ui/toggle-row"
import { useGqlMutation } from "#/graphql/hooks"
import {
	SetUserQuestionCreationEnabledDocument,
	SetUserVerifiedDocument,
} from "#/graphql/mutations/admin"
import { AdminUserVoidHistoryDocument } from "#/graphql/queries/admin"
import { gqlQueryOptions } from "#/graphql/query-options"
import { VOID_REASON_LABELS } from "#/lib/admin/void-defaults"

type Props = {
	user: {
		id: string
		name: string
		username: string
		strikeCount: number
		questionCreationEnabled: boolean
		isVerifiedPundit: boolean
		careerStats: { totalPoints: number } | null
	}
	onChanged: () => void
}

export function UserDetailModal({ user, onChanged }: Props) {
	const { data } = useQuery(
		gqlQueryOptions(
			AdminUserVoidHistoryDocument,
			{ userId: user.id },
			{ abortable: false },
		),
	)
	const setCreationEnabled = useGqlMutation(
		SetUserQuestionCreationEnabledDocument,
	)
	const setVerified = useGqlMutation(SetUserVerifiedDocument)

	const history =
		data?.adminUserVoidHistory.__typename === "QueryAdminUserVoidHistorySuccess"
			? data.adminUserVoidHistory.data
			: []

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>@{user.username}</Modal.Title>
			<HStack
				gap="5"
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.muted",
				})}
			>
				<span>
					<b className={css({ color: "fg.default" })}>
						{user.careerStats?.totalPoints ?? 0}
					</b>{" "}
					pts
				</span>
				<span>
					<b className={css({ color: "fg.default" })}>{user.strikeCount}</b>{" "}
					strikes
				</span>
			</HStack>

			<VStack gap="2" alignItems="stretch">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
					})}
				>
					Void history
				</span>
				{history.length === 0 ? (
					<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
						No voided questions
					</span>
				) : (
					history.map((v) => (
						<HStack
							key={v.id}
							justify="space-between"
							gap="3"
							className={css({
								fontSize: "xs",
								paddingBlock: "2",
								borderBottom: "1px solid {colors.border.default}",
							})}
						>
							<span className={css({ color: "fg.muted" })}>
								{VOID_REASON_LABELS[v.reason]}
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
									whiteSpace: "nowrap",
								})}
							>
								{new Date(v.createdAt).toLocaleDateString()}
							</span>
						</HStack>
					))
				)}
			</VStack>

			<ToggleRow
				label="Question creation"
				description="Auto-locks past the strike threshold: placeholder for now. Override anytime."
				checked={user.questionCreationEnabled}
				onChange={(enabled) => {
					setCreationEnabled
						.mutateAsync({ userId: user.id, enabled })
						.then(onChanged)
				}}
			/>
			<ToggleRow
				label="Verified account"
				description="Shows a verified badge: for media/pundit accounts."
				checked={user.isVerifiedPundit}
				onChange={(verified) => {
					setVerified.mutateAsync({ userId: user.id, verified }).then(onChanged)
				}}
			/>
		</Modal>
	)
}
