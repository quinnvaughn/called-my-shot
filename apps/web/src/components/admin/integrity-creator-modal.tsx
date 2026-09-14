import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Modal } from "#/components/ui/modal"
import { Tag } from "#/components/ui/tag"
import { AdminFrequentCoCallersDocument } from "#/graphql/queries/integrity"
import { gqlQueryOptions } from "#/graphql/query-options"

type Props = {
	creator: { userId: string; username: string }
}

// Who keeps calling one creator's self-graded questions. A second account
// propping up the creator tends to call little else, lose, and skip email
// verification.
export function IntegrityCreatorModal({ creator }: Props) {
	const { data } = useQuery(
		gqlQueryOptions(
			AdminFrequentCoCallersDocument,
			{ creatorId: creator.userId },
			{ abortable: false },
		),
	)
	const rows =
		data?.adminFrequentCoCallers.__typename ===
		"QueryAdminFrequentCoCallersSuccess"
			? data.adminFrequentCoCallers.data
			: []

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>@{creator.username}</Modal.Title>
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
					Frequent callers on their self-graded questions
				</span>
				{rows.length === 0 ? (
					<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
						Nobody has called two or more of them.
					</span>
				) : (
					rows.map((row) => (
						<HStack
							key={row.userId}
							justify="space-between"
							gap="3"
							className={css({
								fontSize: "xs",
								paddingBlock: "2",
								borderBottom: "1px solid {colors.border.default}",
							})}
						>
							<HStack gap="2">
								<span>@{row.username}</span>
								{!row.emailVerified && <Tag>Unverified</Tag>}
							</HStack>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
									whiteSpace: "nowrap",
								})}
							>
								{row.sharedCount} shared · {row.wins}-{row.losses} ·{" "}
								{row.points} pts · {Math.round(row.shareOfTheirCalls * 100)}% of
								their calls
							</span>
						</HStack>
					))
				)}
			</VStack>
		</Modal>
	)
}
