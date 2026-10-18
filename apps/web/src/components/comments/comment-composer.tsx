import { COMMENT_TEXT_MAX } from "@called-my-shot/schemas"
import { useLayoutEffect, useRef, useState } from "react"
import { FiSend } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FormError } from "#/components/ui/form-error"
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
}

// How tall the box grows before it scrolls instead, in pixels.
const MAX_HEIGHT = 160

// One message bar: type and press Enter, or tap the arrow. Shift+Enter is a
// new line. Picking a GIF sends it at once, with whatever's typed.
export function CommentComposer({
	gifsEnabled,
	placeholder,
	onSubmit,
	pending,
}: Props) {
	const [text, setText] = useState("")
	const [error, setError] = useState<string | null>(null)
	const field = useRef<HTMLTextAreaElement>(null)
	const canSend = text.trim().length > 0 && !pending
	const left = COMMENT_TEXT_MAX - text.length

	// Grows with what's typed, one line at rest.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on text
	useLayoutEffect(() => {
		const el = field.current
		if (!el) return
		el.style.height = "auto"
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
	}, [text])

	async function send(gif: Gif | null) {
		if (pending || (!gif && text.trim().length === 0)) return
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
	}

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack
				gap="1"
				alignItems="flex-end"
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
				<textarea
					ref={field}
					rows={1}
					aria-label={placeholder}
					placeholder={placeholder}
					maxLength={COMMENT_TEXT_MAX}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault()
							void send(null)
						}
					}}
					className={css({
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
					})}
				/>
				{left <= 40 && (
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
				)}
				{gifsEnabled && (
					<GifPopover disabled={pending} onPick={(gif) => void send(gif)} />
				)}
				<ComposerBarButton
					label="Send"
					disabled={!canSend}
					active={canSend}
					onClick={() => void send(null)}
				>
					<FiSend size={18} />
				</ComposerBarButton>
			</HStack>
			<FormError message={error} />
		</VStack>
	)
}
