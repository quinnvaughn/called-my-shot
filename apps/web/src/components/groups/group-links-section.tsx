import {
	describeLink,
	GROUP_LINKS_MAX,
	LINK_LABEL_MAX,
	linksSchema,
	normalizeLinkUrl,
} from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { FiChevronDown, FiChevronUp, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { z } from "zod"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldHint } from "#/components/ui/field-hint"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { TextInput } from "#/components/ui/text-input"
import { UpdateGroupLinksDocument } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { useForm } from "#/lib/form/use-form"
import { linkIcons } from "#/lib/link-icons"

type Link = { url: string; label?: string | null }

type Props = {
	groupId: string
	links: Link[]
}

const formSchema = z.object({ links: linksSchema })

function toFormLinks(links: Link[]) {
	return links.map((link) => ({ url: link.url, label: link.label ?? "" }))
}

const rowButton = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "8",
	height: "10",
	flexShrink: 0,
	borderRadius: "lg",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "fg.default", bg: "bg.subtle" },
	_disabled: { opacity: 0.35, cursor: "default", _hover: { bg: "none" } },
})

// Admins only, like the rest of the group's own settings. Saved as one
// ordered set: the order here is the order on the group page.
export function GroupLinksSection({ groupId, links }: Props) {
	const updateLinks = useGqlMutation(UpdateGroupLinksDocument)
	const queryClient = useQueryClient()
	const router = useRouter()
	const [savedNote, setSavedNote] = useState<string | null>(null)

	const form = useForm({
		defaultValues: { links: toFormLinks(links) },
		schema: formSchema,
		onSubmit: async (values, helpers) => {
			const data = await updateLinks.mutateAsync({
				input: { groupId, links: values.links },
			})
			const result = data?.updateGroupLinks

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
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					async (r) => {
						helpers.setFormError(r.message)
					},
				)
				.with({ __typename: "GroupPayload" }, async (r) => {
					// Back to what was stored, so "x.com/foo/" reads as the
					// "https://x.com/foo" it was saved as.
					helpers.reset({ links: toFormLinks(r.group.links) })
					await queryClient.invalidateQueries()
					await router.invalidate()
					setSavedNote("Saved")
					setTimeout(() => setSavedNote(null), 2000)
				})
				.exhaustive()
		},
	})

	return (
		<Card>
			<Card.Body>
				<form onSubmit={form.handleSubmit} id="group-links-form">
					<form.FieldArray name="links">
						{({ items: rows, helpers, meta }) => (
							<VStack gap="3" alignItems="stretch">
								<FieldHint>
									Shows under the group's name on its page. Paste a profile link
									and it picks up the right icon and handle.
								</FieldHint>
								{rows.map((row) => {
									const normalized = normalizeLinkUrl(row.value.url ?? "")
									const described = normalized ? describeLink(normalized) : null
									const Icon = linkIcons[described?.platform ?? "website"]
									return (
										<HStack key={row.id} gap="1" alignItems="flex-start">
											<Flex
												flex="1"
												minWidth="0"
												gap="2"
												flexDirection={{ base: "column", sm: "row" }}
											>
												<form.Field name={`links.${row.index}.url`}>
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															className={css({ flex: "2", minWidth: "0" })}
														>
															<TextInput.Group>
																<TextInput.Icon>
																	<Icon size={15} />
																</TextInput.Icon>
																<TextInput.Field
																	type="text"
																	inputMode="url"
																	autoCapitalize="off"
																	autoCorrect="off"
																	spellCheck={false}
																	aria-label="Link"
																	placeholder="instagram.com/yourgroup"
																	value={field.value}
																	onChange={field.onChange}
																	onBlur={field.onBlur}
																/>
															</TextInput.Group>
														</TextInput>
													)}
												</form.Field>
												<form.Field name={`links.${row.index}.label`}>
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															className={css({ flex: "1", minWidth: "0" })}
														>
															<TextInput.Group>
																<TextInput.Field
																	type="text"
																	aria-label="Label (optional)"
																	maxLength={LINK_LABEL_MAX}
																	// Blank shows this, so the placeholder is
																	// what the link will actually read as.
																	placeholder={described?.label ?? "Label"}
																	value={field.value ?? ""}
																	onChange={field.onChange}
																	onBlur={field.onBlur}
																/>
															</TextInput.Group>
														</TextInput>
													)}
												</form.Field>
											</Flex>
											<button
												type="button"
												aria-label="Move link up"
												disabled={row.index === 0}
												onClick={() => helpers.swap(row.index, row.index - 1)}
												className={rowButton}
											>
												<FiChevronUp size={16} />
											</button>
											<button
												type="button"
												aria-label="Move link down"
												disabled={row.index === rows.length - 1}
												onClick={() => helpers.swap(row.index, row.index + 1)}
												className={rowButton}
											>
												<FiChevronDown size={16} />
											</button>
											<button
												type="button"
												aria-label="Remove link"
												onClick={() => helpers.remove(row.index)}
												className={rowButton}
											>
												<FiX size={15} />
											</button>
										</HStack>
									)
								})}
								<FormError message={meta.touched ? meta.error : null} />
								{rows.length < GROUP_LINKS_MAX && (
									<button
										type="button"
										onClick={() => helpers.push({ url: "", label: "" })}
										className={css({
											width: "100%",
											textAlign: "center",
											fontFamily: "mono",
											fontSize: "xs",
											letterSpacing: "wide",
											color: "fg.subtle",
											border: "1px dashed {colors.border.default}",
											borderRadius: "lg",
											padding: "2.5",
											cursor: "pointer",
											_hover: {
												borderColor: "border.emphasized",
												color: "fg.body",
											},
										})}
									>
										+ Add link
									</button>
								)}
							</VStack>
						)}
					</form.FieldArray>
				</form>
			</Card.Body>
			<Card.Footer>
				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => (
						<HStack justify="flex-end" alignItems="center" gap="3" width="full">
							<SaveNote>{savedNote}</SaveNote>
							<FormError message={meta.formError} />
							<Button
								type="submit"
								form="group-links-form"
								variant="solid"
								size="sm"
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !meta.canSubmit}
							>
								Save
							</Button>
						</HStack>
					)}
				</form.Subscribe>
			</Card.Footer>
		</Card>
	)
}
