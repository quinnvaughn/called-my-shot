import { useQueryClient } from "@tanstack/react-query"
import { ClientOnly, Link, useNavigate } from "@tanstack/react-router"
import { type ChangeEvent, lazy, Suspense, useRef, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "styled-system/recipes"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import {
	CreateUpdateDocument,
	DeleteUpdateDocument,
	EditUpdateDocument,
	SendUpdateEmailDocument,
	SendUpdateTestEmailDocument,
	SetUpdatePublishedDocument,
} from "#/graphql/mutations/updates"
import { ImageSaveError } from "#/lib/images/save-image"
import { uploadUpdateImage } from "#/lib/images/upload-update-image"

const RichTextEditor = lazy(() => import("./rich-text-editor"))

export type EditableUpdate = {
	id: string
	slug: string | null
	title: string
	summary: string
	body: string
	coverImageKey: string | null
	coverImageUrl: string | null
	publishedAt: string | null
	emailedAt: string | null
	emailProgress: { sent: number; skipped: number; pending: number } | null
}

type Draft = {
	title: string
	summary: string
	body: string
	coverImageKey: string | null
	coverImageUrl: string | null
}

type FieldErrors = Partial<Record<"title" | "summary" | "body", string>>

// Every mutation here answers with a union whose failure members carry either
// field errors or a message.
type Failure =
	| {
			__typename: "ValidationError"
			fieldErrors: { field: string | null; message: string }[]
	  }
	| {
			__typename: "NotFoundError" | "AuthenticationError" | "AuthorizationError"
			message: string
	  }

function failureMessage(failure: Failure): string {
	return failure.__typename === "ValidationError"
		? (failure.fieldErrors[0]?.message ?? "That didn't work.")
		: failure.message
}

function fieldErrorsOf(failure: Failure): FieldErrors {
	if (failure.__typename !== "ValidationError") return {}
	const errors: FieldErrors = {}
	for (const { field, message } of failure.fieldErrors) {
		if (field === "title" || field === "summary" || field === "body") {
			errors[field] = message
		}
	}
	return errors
}

function draftOf(update: EditableUpdate | null): Draft {
	return {
		title: update?.title ?? "",
		summary: update?.summary ?? "",
		body: update?.body ?? "",
		coverImageKey: update?.coverImageKey ?? null,
		coverImageUrl: update?.coverImageUrl ?? null,
	}
}

const sectionLabel = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
})

// Writes a new product update (update = null) or edits one. Publishing,
// test sends and the real send all act on the saved version, so they wait
// until there's nothing unsaved.
export function UpdateEditor({ update }: { update: EditableUpdate | null }) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const create = useGqlMutation(CreateUpdateDocument)
	const edit = useGqlMutation(EditUpdateDocument)
	const setPublished = useGqlMutation(SetUpdatePublishedDocument)
	const remove = useGqlMutation(DeleteUpdateDocument)
	const sendTest = useGqlMutation(SendUpdateTestEmailDocument)
	const sendEmail = useGqlMutation(SendUpdateEmailDocument)

	const [draft, setDraft] = useState<Draft>(() => draftOf(update))
	const [saved, setSaved] = useState<Draft>(() => draftOf(update))
	const [errors, setErrors] = useState<FieldErrors>({})
	const [formError, setFormError] = useState<string | null>(null)
	const [note, setNote] = useState<string | null>(null)
	const [uploadingCover, setUploadingCover] = useState(false)
	const coverInput = useRef<HTMLInputElement>(null)

	const dirty =
		draft.title !== saved.title ||
		draft.summary !== saved.summary ||
		draft.body !== saved.body ||
		draft.coverImageKey !== saved.coverImageKey
	const busy =
		create.isPending ||
		edit.isPending ||
		setPublished.isPending ||
		remove.isPending ||
		sendTest.isPending ||
		sendEmail.isPending ||
		uploadingCover

	function flash(message: string) {
		setFormError(null)
		setNote(message)
		setTimeout(() => setNote(null), 3000)
	}

	function fail(message: string) {
		setNote(null)
		setFormError(message)
	}

	const refresh = () => queryClient.invalidateQueries()

	async function handleSave() {
		setErrors({})
		const input = {
			title: draft.title,
			summary: draft.summary,
			body: draft.body,
			coverImageKey: draft.coverImageKey,
		}
		if (!update) {
			const result = (await create.mutateAsync({ input }))?.createUpdate
			if (!result) return fail("Something went wrong. Try again.")
			if (result.__typename !== "Update") {
				setErrors(fieldErrorsOf(result))
				return fail(failureMessage(result))
			}
			await refresh()
			await navigate({
				to: "/admin/updates/$updateId",
				params: { updateId: result.id },
			})
			return
		}
		const result = (await edit.mutateAsync({ id: update.id, input }))
			?.editUpdate
		if (!result) return fail("Something went wrong. Try again.")
		if (result.__typename !== "Update") {
			setErrors(fieldErrorsOf(result))
			return fail(failureMessage(result))
		}
		setSaved(draft)
		await refresh()
		flash("Saved")
	}

	async function handleTogglePublished() {
		if (!update) return
		const published = !update.publishedAt
		if (
			!published &&
			!window.confirm(
				"Unpublish this update? Its page comes down, and any of its emails that haven't gone out yet won't.",
			)
		) {
			return
		}
		const result = (
			await setPublished.mutateAsync({ id: update.id, published })
		)?.setUpdatePublished
		if (!result) return fail("Something went wrong. Try again.")
		if (result.__typename !== "Update") return fail(failureMessage(result))
		await refresh()
		flash(published ? "Published" : "Unpublished")
	}

	async function handleSendTest() {
		if (!update) return
		const result = (await sendTest.mutateAsync({ id: update.id }))
			?.sendUpdateTestEmail
		if (!result) return fail("Something went wrong. Try again.")
		if (result.__typename !== "MutationSendUpdateTestEmailSuccess") {
			return fail(failureMessage(result))
		}
		flash("Test sent to your inbox")
	}

	async function handleSendEmail() {
		if (!update) return
		if (
			!window.confirm(
				"Email this update to everyone who hasn't turned off product updates? This can only be done once.",
			)
		) {
			return
		}
		const result = (await sendEmail.mutateAsync({ id: update.id }))
			?.sendUpdateEmail
		if (!result) return fail("Something went wrong. Try again.")
		if (result.__typename !== "MutationSendUpdateEmailSuccess") {
			return fail(failureMessage(result))
		}
		await refresh()
		flash(
			`Sending to ${result.data} ${result.data === 1 ? "person" : "people"}`,
		)
	}

	async function handleDelete() {
		if (!update) return
		if (!window.confirm(`Delete "${update.title}"? This can't be undone.`)) {
			return
		}
		const result = (await remove.mutateAsync({ id: update.id }))?.deleteUpdate
		if (!result) return fail("Something went wrong. Try again.")
		if (result.__typename !== "MutationDeleteUpdateSuccess") {
			return fail(failureMessage(result))
		}
		await refresh()
		await navigate({ to: "/admin/updates" })
	}

	function failImage(error: unknown) {
		fail(
			error instanceof ImageSaveError
				? error.message
				: "Couldn't upload the image. Try again.",
		)
	}

	async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		// Cleared so picking the same file again still fires a change.
		event.target.value = ""
		if (!file) return
		setUploadingCover(true)
		try {
			const { key, url } = await uploadUpdateImage(file)
			setDraft((d) => ({ ...d, coverImageKey: key, coverImageUrl: url }))
		} catch (error) {
			failImage(error)
		} finally {
			setUploadingCover(false)
		}
	}

	function handleBodyChange(body: string, normalizing: boolean) {
		setDraft((d) => ({ ...d, body }))
		if (normalizing) setSaved((s) => ({ ...s, body }))
	}

	const progress = update?.emailProgress

	return (
		<VStack gap="6" alignItems="stretch">
			{update && (
				<HStack gap="3" flexWrap="wrap">
					{update.emailedAt ? (
						<Tag variant="secondary" size="sm">
							Emailed
						</Tag>
					) : update.publishedAt ? (
						<Tag variant="success" size="sm">
							Published
						</Tag>
					) : (
						<Tag variant="neutral" size="sm">
							Draft
						</Tag>
					)}
					{update.emailedAt && !update.publishedAt && (
						<Tag variant="neutral" size="sm">
							Unpublished
						</Tag>
					)}
					{progress && (
						<span className={css({ fontFamily: "mono", fontSize: "xs" })}>
							{progress.sent} sent · {progress.pending} waiting ·{" "}
							{progress.skipped} skipped
						</span>
					)}
					{update.publishedAt && update.slug && (
						<Link
							to="/updates/$slug"
							params={{ slug: update.slug }}
							target="_blank"
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
								textDecoration: "underline",
							})}
						>
							View page
						</Link>
					)}
				</HStack>
			)}

			<Card>
				<Card.Body>
					<VStack gap="4" alignItems="stretch">
						<TextInput error={errors.title}>
							<TextInput.Label>Title</TextInput.Label>
							<TextInput.Group>
								<TextInput.Field
									value={draft.title}
									maxLength={100}
									onChange={(e) =>
										setDraft((d) => ({ ...d, title: e.target.value }))
									}
								/>
							</TextInput.Group>
						</TextInput>
						<TextInput
							error={errors.summary}
							description="One line. Shown on the updates list and as the email's preview text."
						>
							<TextInput.Label>Summary</TextInput.Label>
							<TextInput.Group>
								<TextInput.Field
									value={draft.summary}
									maxLength={200}
									onChange={(e) =>
										setDraft((d) => ({ ...d, summary: e.target.value }))
									}
								/>
							</TextInput.Group>
						</TextInput>

						<VStack gap="2" alignItems="flex-start">
							<span className={sectionLabel}>Cover image</span>
							{draft.coverImageUrl && (
								<img
									src={draft.coverImageUrl}
									alt=""
									className={css({
										maxWidth: "sm",
										borderRadius: "lg",
										border: "1px solid {colors.border.default}",
									})}
								/>
							)}
							<HStack gap="2">
								<Button
									variant="outline"
									size="sm"
									loading={uploadingCover}
									disabled={busy}
									onClick={() => coverInput.current?.click()}
								>
									{draft.coverImageKey ? "Replace" : "Upload"}
								</Button>
								{draft.coverImageKey && (
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() =>
											setDraft((d) => ({
												...d,
												coverImageKey: null,
												coverImageUrl: null,
											}))
										}
									>
										Remove
									</Button>
								)}
							</HStack>
							<input
								ref={coverInput}
								type="file"
								accept="image/*"
								hidden
								onChange={uploadCover}
							/>
						</VStack>

						<VStack gap="2" alignItems="stretch">
							<span className={sectionLabel}>Body</span>
							<ClientOnly fallback={<EditorPlaceholder />}>
								<Suspense fallback={<EditorPlaceholder />}>
									<RichTextEditor
										initialMarkdown={update?.body ?? ""}
										onChange={handleBodyChange}
										onImageError={failImage}
									/>
								</Suspense>
							</ClientOnly>
							<FormError message={errors.body ?? null} />
						</VStack>
					</VStack>
				</Card.Body>
				<Card.Footer>
					<HStack
						justify="space-between"
						alignItems="center"
						gap="3"
						width="full"
						flexWrap="wrap"
					>
						<HStack gap="2" flexWrap="wrap">
							{update && !update.emailedAt && (
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={handleDelete}
								>
									Delete
								</Button>
							)}
							{update && (
								<>
									<Button
										variant="outline"
										size="sm"
										loading={sendTest.isPending}
										disabled={busy || dirty}
										onClick={handleSendTest}
									>
										Send me a test
									</Button>
									<Button
										variant="outline"
										size="sm"
										loading={setPublished.isPending}
										disabled={busy || dirty}
										onClick={handleTogglePublished}
									>
										{update.publishedAt ? "Unpublish" : "Publish"}
									</Button>
									{update.publishedAt && !update.emailedAt && (
										<Button
											variant="outline"
											size="sm"
											loading={sendEmail.isPending}
											disabled={busy || dirty}
											onClick={handleSendEmail}
										>
											Send email
										</Button>
									)}
								</>
							)}
						</HStack>
						<HStack gap="3" alignItems="center">
							<SaveNote>{dirty && update ? "Unsaved changes" : note}</SaveNote>
							<FormError message={formError} />
							<Button
								variant="solid"
								size="sm"
								loading={create.isPending || edit.isPending}
								disabled={busy || (!dirty && !!update)}
								onClick={handleSave}
							>
								{update ? "Save" : "Save draft"}
							</Button>
						</HStack>
					</HStack>
				</Card.Footer>
			</Card>
			<Link
				to="/admin/updates"
				className={button({ variant: "ghost", size: "sm" })}
			>
				← All updates
			</Link>
		</VStack>
	)
}

function EditorPlaceholder() {
	return (
		<div
			className={css({
				minHeight: "80",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				bg: "bg.surface",
			})}
		/>
	)
}
