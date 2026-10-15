import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { ToggleRow } from "#/components/ui/toggle-row"
import { ApiError } from "#/graphql/api-error"
import {
	invalidateGroupBoards,
	SetHiddenFromRecapsDocument,
	UpdateGroupRecapSettingsDocument,
} from "#/graphql/groups/mutations"
import { GroupRecapPageDocument } from "#/graphql/groups/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryPrefix } from "#/graphql/query-options"

type Props = {
	groupId: string
	viewerIsAdmin: boolean
	linksEnabled: boolean
	showsWorstMiss: boolean
	hiddenFromRecaps: boolean
}

type Result =
	| { __typename: "GroupPayload" }
	| {
			__typename:
				| "AuthenticationError"
				| "AuthorizationError"
				| "ValidationError"
			message: string
	  }

// Every member gets the opt-out; the two group-wide switches are admins'.
// Each toggle saves as soon as it's flipped. Both apply to recaps already
// made, since which slots a recap shows is decided when it's read.
export function GroupRecapsSection({
	groupId,
	viewerIsAdmin,
	linksEnabled,
	showsWorstMiss,
	hiddenFromRecaps,
}: Props) {
	const queryClient = useQueryClient()
	const updateSettings = useGqlMutation(UpdateGroupRecapSettingsDocument)
	const setHidden = useGqlMutation(SetHiddenFromRecapsDocument)
	const [error, setError] = useState<string | null>(null)

	async function handle(result: Result | null | undefined) {
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		match(result)
			.with({ __typename: "GroupPayload" }, () => setError(null))
			.with(ApiError, { __typename: "ValidationError" }, (r) =>
				setError(r.message),
			)
			.exhaustive()
		await Promise.all([
			invalidateGroupBoards(queryClient, groupId),
			queryClient.invalidateQueries({
				queryKey: gqlQueryPrefix(GroupRecapPageDocument),
			}),
		])
	}

	async function saveSettings(next: {
		linksEnabled: boolean
		showsWorstMiss: boolean
	}) {
		const data = await updateSettings.mutateAsync({
			input: { groupId, ...next },
		})
		await handle(data?.updateGroupRecapSettings)
	}

	async function saveHidden(hidden: boolean) {
		const data = await setHidden.mutateAsync({ groupId, hidden })
		await handle(data?.setHiddenFromRecaps)
	}

	return (
		<Card>
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					{viewerIsAdmin && (
						<>
							<ToggleRow
								label="Recap links"
								description="Members can share each week's recap as a link anyone can open. Off, recaps only show on this page."
								checked={linksEnabled}
								onChange={(checked) =>
									saveSettings({ linksEnabled: checked, showsWorstMiss })
								}
							/>
							<ToggleRow
								label="Show the worst miss"
								description="Each recap names the week's biggest miss."
								checked={showsWorstMiss}
								onChange={(checked) =>
									saveSettings({ linksEnabled, showsWorstMiss: checked })
								}
							/>
						</>
					)}
					<ToggleRow
						label="Keep me off recaps"
						description="Your calls still count toward the group's weekly record, but no recap names you."
						checked={hiddenFromRecaps}
						onChange={saveHidden}
					/>
					<FormError message={error} />
				</VStack>
			</Card.Body>
		</Card>
	)
}
