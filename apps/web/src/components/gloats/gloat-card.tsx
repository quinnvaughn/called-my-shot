import { useQueryClient } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ReportContentModal } from "#/components/moderation/report-content-modal"
import {
	PresserMenu,
	type PresserMenuAction,
} from "#/components/pressers/presser-menu"
import { Identity } from "#/components/ui/identity"
import { ReportGloatDocument } from "#/graphql/challenges/mutations"
import type { PresserReportReason } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	BlockUserDocument,
	invalidateAfterBlock,
} from "#/graphql/pressers/mutations"
import { useMe } from "#/hooks/use-me"
import { openModal } from "#/stores/modal-store"

export type GloatData = {
	id: string
	removed: boolean
	text: string | null
	gif: {
		url: string
		width: number
		height: number
		alt: string
	} | null
	sender: {
		id: string
		username: string
		name: string
		avatarUrl: string | null
	}
}

// A sent gloat: who sent it, their words and GIF, and a menu to report it
// or block whoever sent it.
export function GloatCard({ gloat }: { gloat: GloatData }) {
	const me = useMe()
	const report = useGqlMutation(ReportGloatDocument)
	const block = useGqlMutation(BlockUserDocument)
	const queryClient = useQueryClient()

	const actions: PresserMenuAction[] =
		!me || me.id === gloat.sender.id || gloat.removed
			? []
			: [
					{
						label: "Report",
						onSelect: () =>
							openModal(
								<ReportContentModal
									title="Report this trash talk"
									submit={async ({ reason, details }) => {
										const result = (
											await report.mutateAsync({
												input: {
													gloatId: gloat.id,
													reason: reason.toUpperCase() as PresserReportReason,
													details: details || undefined,
												},
											})
										)?.reportGloat
										if (result?.__typename === "GloatReportPayload") return null
										return result?.__typename === "ValidationError"
											? (result.fieldErrors[0]?.message ?? result.message)
											: (result?.message ?? "Something went wrong. Try again.")
									}}
								/>,
							),
					},
					{
						label: `Block @${gloat.sender.username}`,
						danger: true,
						onSelect: async () => {
							await block.mutateAsync({ username: gloat.sender.username })
							await invalidateAfterBlock(queryClient)
						},
					},
				]

	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				padding: "3",
				borderRadius: "lg",
				backgroundColor: "bg.subtle",
			})}
		>
			<HStack justify="space-between" gap="3">
				<Identity
					name={gloat.sender.name}
					username={gloat.sender.username}
					avatarUrl={gloat.sender.avatarUrl}
					trailing="talked trash"
				/>
				<PresserMenu label="Trash talk options" actions={actions} />
			</HStack>
			{gloat.removed ? (
				<p
					className={css({
						fontSize: "sm",
						color: "fg.subtle",
						fontStyle: "italic",
					})}
				>
					Removed by moderators
				</p>
			) : (
				<>
					{gloat.text && (
						<p
							className={css({
								fontSize: "sm",
								whiteSpace: "pre-wrap",
								overflowWrap: "anywhere",
							})}
						>
							{gloat.text}
						</p>
					)}
					{gloat.gif && (
						<img
							src={gloat.gif.url}
							alt={gloat.gif.alt}
							width={gloat.gif.width}
							height={gloat.gif.height}
							loading="lazy"
							className={css({
								maxHeight: "60",
								width: "auto",
								maxWidth: "full",
								borderRadius: "md",
								alignSelf: "flex-start",
							})}
						/>
					)}
				</>
			)}
		</VStack>
	)
}
