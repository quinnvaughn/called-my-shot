import { createBallotSchema } from "@called-my-shot/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	EntitySearchField,
	type EntitySearchItem,
} from "#/components/questions/create-question/entity-search-field"
import { Button } from "#/components/ui/button"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import {
	CreateBallotDocument,
	invalidateBallots,
} from "#/graphql/ballots/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryOptions } from "#/graphql/query-options"
import { SportsDocument } from "#/graphql/sports/catalog/queries"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

export function NewBallotModal() {
	const queryClient = useQueryClient()
	const { data: sportsData } = useQuery(gqlQueryOptions(SportsDocument, {}))
	const createBallot = useGqlMutation(CreateBallotDocument)
	const navigate = useNavigate()
	const [leagueInputText, setLeagueInputText] = useState("")

	const leagues = (sportsData?.sports ?? []).flatMap((sport) => sport.leagues)

	const form = useForm({
		schema: createBallotSchema,
		defaultValues: { name: "", leagueId: "" },
		onSubmit: async (values, helpers) => {
			const data = await createBallot.mutateAsync({ input: values })
			const result = data?.createBallot

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "AuthenticationError" }, async () => {
					helpers.setFormError("You need to sign in.")
				})
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "BallotPayload" }, async (r) => {
					closeModal()
					await invalidateBallots(queryClient)
					await navigate({
						to: "/admin/ballots/$ballotId",
						params: { ballotId: r.ballot.id },
					})
				})
				.exhaustive()
		},
	})

	const leagueId = form.useWatch("leagueId")
	const selectedLeague = leagues.find((l) => l.id === leagueId)
	const leagueItems: EntitySearchItem[] = leagues.map((league) => ({
		id: league.id,
		label: league.name,
		kind: "league" as const,
		meta: league.abbreviation,
	}))

	return (
		<Modal>
			<Modal.CloseButton />
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>New ballot</Modal.Title>
				<Modal.Description>
					A named bundle of related questions - a Gold Glove race's positions, a
					week of games. Sport and season are derived from the league.
				</Modal.Description>
			</VStack>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="name">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label required>Name</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="2026 AL Gold Gloves"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<VStack gap="1.5" alignItems="stretch">
						<FieldLabel required>League</FieldLabel>
						<EntitySearchField
							value={leagueInputText || (selectedLeague?.name ?? "")}
							onValueChange={(text) => {
								setLeagueInputText(text)
								form.setValue("leagueId", "")
							}}
							items={leagueItems}
							placeholder="Search leagues…"
							required
							onSelectItem={(item) => {
								setLeagueInputText(item.label)
								form.setValue("leagueId", item.id)
							}}
						/>
					</VStack>
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="3.5" alignItems="stretch">
								<Button
									type="submit"
									variant="solid"
									size="md"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Create ballot
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</Modal>
	)
}
