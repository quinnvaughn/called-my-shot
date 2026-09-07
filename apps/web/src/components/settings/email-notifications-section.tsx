import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { ToggleRow } from "#/components/ui/toggle-row"
import type { EmailPreferenceType } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { SetEmailPreferenceDocument } from "#/graphql/queries/user"

type Props = {
	// The types this user has muted. Absence means subscribed - see
	// db/schema/email.ts on the api for why opt-outs are stored, not opt-ins.
	mutedEmailTypes: EmailPreferenceType[]
}

export function EmailNotificationsSection({ mutedEmailTypes }: Props) {
	const setPreference = useGqlMutation(SetEmailPreferenceDocument)
	const queryClient = useQueryClient()
	const router = useRouter()
	const [savedNote, setSavedNote] = useState<string | null>(null)
	const [formError, setFormError] = useState<string | null>(null)
	// Which toggle is mid-flight, so only that row goes disabled rather than
	// the whole card.
	const [pending, setPending] = useState<EmailPreferenceType | null>(null)

	const mutedAll = mutedEmailTypes.includes("ALL")
	const mutedResults = mutedEmailTypes.includes("CALL_RESOLVED")
	const mutedSeasonStarts = mutedEmailTypes.includes("SEASON_STARTING")

	async function toggle(type: EmailPreferenceType, enabled: boolean) {
		setFormError(null)
		setPending(type)
		try {
			const data = await setPreference.mutateAsync({ input: { type, enabled } })
			const result = data?.setEmailPreference
			if (!result) {
				setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					setFormError(r.fieldErrors?.[0]?.message ?? "That didn't work.")
				})
				.with({ __typename: "AuthenticationError" }, async () => {
					setFormError("You need to sign in to do that.")
				})
				.with({ __typename: "User" }, async () => {
					await queryClient.invalidateQueries()
					await router.invalidate()
					setSavedNote("Saved")
					setTimeout(() => setSavedNote(null), 2000)
				})
				.exhaustive()
		} finally {
			setPending(null)
		}
	}

	return (
		<Card>
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					<ToggleRow
						label="Call results"
						description={
							mutedAll
								? "Turn all email back on to change this."
								: "One email when your calls resolve, batched so a full slate doesn't mean a full inbox."
						}
						checked={!mutedAll && !mutedResults}
						onChange={(checked) =>
							!mutedAll && pending === null && toggle("CALL_RESOLVED", checked)
						}
					/>
					<ToggleRow
						label="Season kickoffs"
						description={
							mutedAll
								? "Turn all email back on to change this."
								: "One email a week before a season starts, per sport, with what's open to call."
						}
						checked={!mutedAll && !mutedSeasonStarts}
						onChange={(checked) =>
							!mutedAll &&
							pending === null &&
							toggle("SEASON_STARTING", checked)
						}
					/>
					<ToggleRow
						label="All email"
						description="Off means we send nothing except account email - verifying your address, or confirming a change to it."
						checked={!mutedAll}
						onChange={(checked) => pending === null && toggle("ALL", checked)}
					/>
				</VStack>
			</Card.Body>
			<Card.Footer>
				<HStack justify="flex-end" alignItems="center" gap="3" width="full">
					<SaveNote>{savedNote}</SaveNote>
					<FormError message={formError} />
				</HStack>
			</Card.Footer>
		</Card>
	)
}
