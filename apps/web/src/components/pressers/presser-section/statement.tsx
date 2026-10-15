import { PRESSER_STATEMENT_MAX } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { HStack, VStack } from "styled-system/jsx"
import { PresserMenu } from "#/components/pressers/presser-menu"
import {
	presserBodyText,
	presserEyebrow,
} from "#/components/pressers/presser-qa-item"
import { presserResultError } from "#/components/pressers/presser-result"
import { PresserTextForm } from "#/components/pressers/presser-text-form"
import { Identity } from "#/components/ui/identity"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidatePressers,
	PostPresserStatementDocument,
} from "#/graphql/pressers/mutations"
import type { IdentityData } from "#/lib/identity"
import { reportAction } from "./presser-actions"
import type { PresserData } from "./types"

export function Statement({
	presser: p,
	owner,
	viewerId,
}: {
	presser: PresserData
	owner: IdentityData
	viewerId: string | null
}) {
	const post = useGqlMutation(PostPresserStatementDocument)
	const queryClient = useQueryClient()

	if (p.statement) {
		const actions =
			viewerId && !p.viewerIsOwner
				? [reportAction("Report statement", p.id, null, "STATEMENT")]
				: []
		return (
			<VStack gap="2" alignItems="stretch">
				<HStack justify="space-between" alignItems="flex-start" gap="3">
					<VStack gap="1.5" alignItems="flex-start">
						<span className={presserEyebrow}>Opening statement</span>
						<Identity
							name={owner.name}
							username={owner.username}
							avatarUrl={owner.avatarUrl}
							flair={owner.flair}
							size="xs"
						/>
					</VStack>
					<PresserMenu label="Statement options" actions={actions} />
				</HStack>
				<p className={presserBodyText}>{p.statement}</p>
			</VStack>
		)
	}
	if (!p.viewerIsOwner || !p.isOpen || p.statementPostedAt) return null

	return (
		<PresserTextForm
			label="Opening statement (optional)"
			placeholder="Say your piece about the night. You only get one."
			max={PRESSER_STATEMENT_MAX}
			submitLabel="Post statement"
			onSubmit={async (text) => {
				const data = await post.mutateAsync({
					input: { presserId: p.id, text },
				})
				const error = presserResultError(data?.postPresserStatement)
				if (!error) await invalidatePressers(queryClient)
				return error
			}}
		/>
	)
}
