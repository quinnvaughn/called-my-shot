import {
	fileSupportTicketSchema,
	supportCategorySchema,
} from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import type { SupportCategory } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { FileSupportTicketDocument } from "#/graphql/mutations/support"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"

const supportCategoryLabel: Record<SupportCategory, string> = {
	BUG: "Bug",
	FEATURE_REQUEST: "Feature Request",
	CALL_QUESTION: "Question About a Call",
	OTHER: "Other",
}

function categoryLabel(value: string) {
	return supportCategoryLabel[value.toUpperCase() as SupportCategory]
}

const SHOW_RELATED_URL = ["feature_request", "call_question"]

type SubmittedTicket = { id: string; createdAt: string }

export function SupportForm() {
	const fileSupportTicket = useGqlMutation(FileSupportTicketDocument)
	const [ticket, setTicket] = useState<SubmittedTicket | null>(null)

	const form = useForm({
		schema: fileSupportTicketSchema,
		defaultValues: {
			category: "bug",
			subject: "",
			message: "",
			relatedUrl: "",
		},
		onSubmit: async (values, helpers) => {
			const data = await fileSupportTicket.mutateAsync({
					input: {
						category: values.category.toUpperCase() as SupportCategory,
						subject: values.subject,
						message: values.message,
						relatedUrl: values.relatedUrl || undefined,
					},
				})
			const result = data?.fileSupportTicket

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
				.with({ __typename: "AuthenticationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "FileSupportTicketPayload" }, async (r) => {
					track("support_ticket_filed", { category: values.category })
					setTicket({ id: r.id, createdAt: r.createdAt })
					helpers.reset()
				})
				.exhaustive()
		},
	})

	const category = form.useWatch("category")

	if (ticket) {
		return (
			<Card>
				<Card.Body>
					<VStack gap="4" alignItems="center" textAlign="center">
						<h2 className={css({ fontFamily: "heading", fontSize: "xl" })}>
							Sent
						</h2>
						<div
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
								bg: "bg.subtle",
								border: "1px solid {colors.border.default}",
								borderRadius: "lg",
								padding: "2 3",
							})}
						>
							REF #{ticket.id.slice(0, 8).toUpperCase()} ·{" "}
							{DateTime.fromISO(ticket.createdAt).toFormat("MMM d, h:mm a")}
						</div>
					</VStack>
				</Card.Body>
				<Card.Footer>
					<HStack width="full" justify={"flex-end"}>
						<Button variant="solid" size="sm" onClick={() => setTicket(null)}>
							Send another
						</Button>
					</HStack>
				</Card.Footer>
			</Card>
		)
	}

	return (
		<VStack gap="4" alignItems="stretch">
			<Card>
				<Card.Body>
					<form onSubmit={form.handleSubmit} id="support-form">
						<VStack gap="4" alignItems="stretch">
							<form.Field name="category">
								{(field) => (
									<Select value={field.value} onValueChange={field.onChange}>
										<Select.Trigger>
											{categoryLabel(field.value)}
										</Select.Trigger>
										<Select.Content>
											{supportCategorySchema.options.map((c) => (
												<Select.Option key={c} value={c}>
													{categoryLabel(c)}
												</Select.Option>
											))}
										</Select.Content>
									</Select>
								)}
							</form.Field>

							<form.Field name="subject">
								{(field) => (
									<TextInput error={field.meta.error ?? undefined}>
										<TextInput.Label required>Subject</TextInput.Label>
										<TextInput.Group>
											<TextInput.Field
												maxLength={120}
												placeholder="One line summary"
												value={field.value}
												onChange={field.onChange}
												onBlur={field.onBlur}
											/>
										</TextInput.Group>
									</TextInput>
								)}
							</form.Field>

							<form.Field name="message">
								{(field) => (
									<Textarea error={field.meta.error ?? undefined}>
										<Textarea.Label required>Details</Textarea.Label>
										<Textarea.Field
											maxLength={1000}
											placeholder="What happened, and what did you expect instead?"
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
										/>
										<Textarea.CharCount value={field.value} max={1000} />
									</Textarea>
								)}
							</form.Field>

							{SHOW_RELATED_URL.includes(category) && (
								<form.Field name="relatedUrl">
									{(field) => (
										<TextInput
											error={field.meta.error ?? undefined}
											description={
												category === "feature_request"
													? "Requesting a stat? Link the question so we can look it up fast."
													: undefined
											}
										>
											<TextInput.Label>
												Related question link (optional)
											</TextInput.Label>
											<TextInput.Group>
												<TextInput.Field
													placeholder="Paste a link to the question"
													value={field.value}
													onChange={field.onChange}
													onBlur={field.onBlur}
												/>
											</TextInput.Group>
										</TextInput>
									)}
								</form.Field>
							)}
						</VStack>
					</form>
				</Card.Body>
				<Card.Footer>
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="2" alignItems="stretch" width="full">
								<Button
									type="submit"
									form="support-form"
									variant="solid"
									size="sm"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Send to support
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</Card.Footer>
			</Card>
		</VStack>
	)
}
