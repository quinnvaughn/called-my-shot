import { GLOAT_TEXT_MAX } from "@called-my-shot/schemas"
import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import type { GifSearchQuery } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { SendChallengeGloatDocument } from "#/graphql/mutations/challenges"
import { gifSearchQuery } from "#/graphql/queries/challenges"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { closeModal } from "#/stores/modal-store"

type Gif = GifSearchQuery["gifSearch"][number]

type Props = {
	challengeId: string
	// Who it goes to, as the modal says it: "@quinn", "the 4 people you beat".
	recipients: string
}

// A winner's one gloat: their own words, a GIF, or both. Sent once, and it
// can't be taken back.
export function GloatComposerModal({ challengeId, recipients }: Props) {
	const send = useGqlMutation(SendChallengeGloatDocument)
	const queryClient = useQueryClient()
	const [text, setText] = useState("")
	const [gif, setGif] = useState<Gif | null>(null)
	const [error, setError] = useState<string | null>(null)
	const canSend = text.trim().length > 0 || gif !== null
	// The picker's own first load, read here for whether a GIF is an option.
	const gifsEnabled = useQuery(gifSearchQuery("")).data?.gifsEnabled ?? false

	async function submit() {
		setError(null)
		const result = (
			await send.mutateAsync({
				input: {
					challengeId,
					text: text.trim() || undefined,
					gif: gif
						? {
								id: gif.id,
								url: gif.url,
								width: gif.width,
								height: gif.height,
								alt: gif.alt,
							}
						: undefined,
				},
			})
		)?.sendChallengeGloat
		if (result?.__typename === "GloatSentPayload") {
			await queryClient.invalidateQueries()
			closeModal()
			return
		}
		setError(
			result?.__typename === "ValidationError"
				? (result.fieldErrors[0]?.message ?? result.message)
				: (result?.message ?? "Something went wrong. Try again."),
		)
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Trash talk</Modal.Title>
			<Modal.Description>
				Goes to {recipients}. You get one, and it can't be edited once it's
				sent.
			</Modal.Description>
			<VStack gap="4" alignItems="stretch">
				<Textarea>
					<Textarea.Label>
						{gifsEnabled
							? "Say something (optional with a GIF)"
							: "Say something"}
					</Textarea.Label>
					<Textarea.Field
						maxLength={GLOAT_TEXT_MAX}
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
					<Textarea.CharCount value={text} max={GLOAT_TEXT_MAX} />
				</Textarea>
				<GifPicker selected={gif} onSelect={setGif} />
				<FormError message={error} />
				<Button
					variant="solid"
					size="lg"
					fullWidth
					disabled={!canSend || send.isPending}
					loading={send.isPending}
					onClick={submit}
				>
					Send it
				</Button>
			</VStack>
		</Modal>
	)
}

function GifPicker({
	selected,
	onSelect,
}: {
	selected: Gif | null
	onSelect: (gif: Gif | null) => void
}) {
	const [search, setSearch] = useState("")
	const query = useDebouncedValue(search.trim(), 350)
	// The last results stay up while a new search loads, so nothing in the
	// picker blinks out between keystrokes.
	const { data, isFetching } = useQuery({
		...gifSearchQuery(query),
		placeholderData: keepPreviousData,
	})

	// Hidden until the api says GIFs are on, so it never flashes up where
	// they aren't.
	if (!data?.gifsEnabled) return null

	if (selected) {
		return (
			<div
				className={css({
					position: "relative",
					alignSelf: "center",
					width: "fit-content",
					maxWidth: "full",
				})}
			>
				<img
					src={selected.url}
					alt={selected.alt}
					width={selected.width}
					height={selected.height}
					className={css({
						display: "block",
						maxHeight: "48",
						maxWidth: "full",
						width: "auto",
						height: "auto",
						borderRadius: "md",
					})}
				/>
				<button
					type="button"
					aria-label="Remove GIF"
					onClick={() => onSelect(null)}
					className={css({
						position: "absolute",
						top: "2",
						right: "2",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "8",
						height: "8",
						borderRadius: "full",
						bg: "bg.surface",
						border: "1px solid {colors.border.default}",
						color: "fg.default",
						cursor: "pointer",
						_hover: { bg: "bg.subtle" },
					})}
				>
					<FiX size={16} />
				</button>
			</div>
		)
	}

	const gifs = data?.gifSearch ?? []
	return (
		<VStack gap="2" alignItems="stretch">
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						type="search"
						placeholder="Search KLIPY"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<Grid
				columns={3}
				gap="1.5"
				className={css({ maxHeight: "64", overflowY: "auto" })}
			>
				{gifs.map((g) => (
					<button
						key={g.id}
						type="button"
						aria-label={g.alt || "GIF"}
						onClick={() => onSelect(g)}
						className={css({
							borderRadius: "md",
							overflow: "hidden",
							cursor: "pointer",
							_hover: { opacity: 0.85 },
						})}
					>
						<img
							src={g.previewUrl}
							alt={g.alt}
							loading="lazy"
							className={css({
								width: "full",
								height: "24",
								objectFit: "cover",
								display: "block",
							})}
						/>
					</button>
				))}
			</Grid>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
				})}
			>
				{isFetching ? "Searching…" : gifs.length === 0 ? "No GIFs found" : ""}
			</span>
		</VStack>
	)
}
