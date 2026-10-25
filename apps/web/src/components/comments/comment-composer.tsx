import { COMMENT_TEXT_MAX } from "@called-my-shot/schemas"
import { useLayoutEffect, useRef, useState } from "react"
import { FiSend } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { AttachedGif } from "./attached-gif"
import { ComposerBarButton } from "./composer-bar-button"
import type { Gif } from "./gif-picker"
import { GifPopover } from "./gif-popover"

export type CommentDraft = {
	text?: string
	gif?: { id: string; url: string; width: number; height: number; alt: string }
}

type Props = {
	gifsEnabled: boolean
	placeholder: string
	// Posts the draft. Resolves to an error to show, or null once it's in,
	// which clears the bar.
	onSubmit: (draft: CommentDraft) => Promise<string | null>
	pending: boolean
	// Puts the cursor in the box as it appears, for a reply box opened under
	// the comment being answered.
	autoFocus?: boolean
	// "bar" is a chat's: one line that grows, Enter sends, the GIF and send
	// icons inside it on the right. "box" is a thread's, the way Reddit does
	// it: a few lines tall to start, Enter is a new line, and the GIF button
	// and a labeled submit (with Cancel, when there's one) in a row under the
	// text.
	layout?: "bar" | "box"
	// The box's submit button: "Comment", "Reply".
	submitLabel?: string
	// Closes the box, for a reply box that was opened under a comment.
	onCancel?: () => void
	// How many lines the box starts at.
	rows?: number
}

// How tall each layout grows before it scrolls instead, in pixels.
const MAX_HEIGHT = { bar: 160, box: 320 }

// A message box: a chat's bar or a thread's box (see layout). A picked GIF
// sits above the text, removable, until the message is sent; picking another
// replaces it.
export function CommentComposer({
	gifsEnabled,
	placeholder,
	onSubmit,
	pending,
	autoFocus,
	layout = "bar",
	submitLabel = "Comment",
	onCancel,
	rows = 3,
}: Props) {
	const [text, setText] = useState("")
	const [gif, setGif] = useState<Gif | null>(null)
	const [error, setError] = useState<string | null>(null)
	const field = useRef<HTMLTextAreaElement>(null)
	const canSend = (text.trim().length > 0 || gif !== null) && !pending
	const left = COMMENT_TEXT_MAX - text.length

	// Grows with what's typed, one line at rest.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on text
	useLayoutEffect(() => {
		const el = field.current
		if (!el) return
		el.style.height = "auto"
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT[layout])}px`
	}, [text, layout])

	async function send() {
		if (!canSend) return
		setError(null)
		const failed = await onSubmit({
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
		})
		if (failed) {
			setError(failed)
			return
		}
		setText("")
		setGif(null)
	}

	const counter = left <= 40 && (
		<span
			className={css({
				textStyle: "meta",
				color: left <= 0 ? "danger.default" : "fg.muted",
				alignSelf: "center",
				paddingInline: "1",
			})}
		>
			{left}
		</span>
	)
	const gifButton = gifsEnabled && (
		<GifPopover
			disabled={pending}
			onPick={(picked) => {
				setGif(picked)
				field.current?.focus()
			}}
		/>
	)
	const textareaClass = css({
		flex: "1",
		minWidth: "0",
		resize: "none",
		bg: "transparent",
		border: "none",
		outline: "none",
		fontSize: "md",
		lineHeight: "1.5",
		paddingBlock: "1.5",
		color: "fg.default",
		_placeholder: { color: "fg.muted" },
	})

	if (layout === "box") {
		return (
			<VStack gap="2" alignItems="stretch">
				<VStack
					gap="1"
					alignItems="stretch"
					className={css({
						padding: "{spacing.2} {spacing.2} {spacing.2} {spacing.3}",
						borderRadius: "xl",
						bg: "bg.subtle",
						border: "1px solid {colors.border.default}",
						_focusWithin: { border: "1px solid {colors.border.emphasized}" },
					})}
				>
					{gif && (
						<div className={css({ paddingTop: "1" })}>
							<AttachedGif gif={gif} onRemove={() => setGif(null)} />
						</div>
					)}
					<textarea
						ref={field}
						rows={rows}
						// biome-ignore lint/a11y/noAutofocus: opened by tapping Reply, so focus is expected
						autoFocus={autoFocus}
						aria-label={placeholder}
						placeholder={placeholder}
						maxLength={COMMENT_TEXT_MAX}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							// Enter is a new line here; Cmd or Ctrl+Enter sends.
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault()
								void send()
							}
						}}
						className={textareaClass}
					/>
					<HStack justify="space-between" gap="2">
						<HStack gap="1">
							{gifButton}
							{counter}
						</HStack>
						<HStack gap="2">
							{onCancel && (
								<Button variant="ghost" size="sm" onClick={onCancel}>
									Cancel
								</Button>
							)}
							<Button
								size="sm"
								disabled={!canSend}
								loading={pending}
								onClick={() => void send()}
							>
								{submitLabel}
							</Button>
						</HStack>
					</HStack>
				</VStack>
				<FormError message={error} />
			</VStack>
		)
	}

	return (
		<VStack gap="2" alignItems="stretch">
			<VStack
				gap="1.5"
				alignItems="stretch"
				className={css({
					paddingInlineStart: "4",
					paddingInlineEnd: "1.5",
					paddingBlock: "1.5",
					borderRadius: "xl",
					bg: "bg.subtle",
					border: "1px solid {colors.border.default}",
					_focusWithin: { border: "1px solid {colors.border.emphasized}" },
				})}
			>
				{gif && (
					<div className={css({ paddingTop: "1.5" })}>
						<AttachedGif gif={gif} onRemove={() => setGif(null)} />
					</div>
				)}
				<HStack gap="1" alignItems="flex-end">
					<textarea
						ref={field}
						rows={1}
						// biome-ignore lint/a11y/noAutofocus: opened by tapping Reply, so focus is expected
						autoFocus={autoFocus}
						aria-label={placeholder}
						placeholder={placeholder}
						maxLength={COMMENT_TEXT_MAX}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								void send()
							}
						}}
						className={textareaClass}
					/>
					{counter}
					{gifButton}
					<ComposerBarButton
						label="Send"
						disabled={!canSend}
						active={canSend}
						onClick={() => void send()}
					>
						<FiSend size={18} />
					</ComposerBarButton>
				</HStack>
			</VStack>
			<FormError message={error} />
		</VStack>
	)
}
