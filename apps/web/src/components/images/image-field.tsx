import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	ImageSaveError,
	type ImageTarget,
	removeImage,
} from "#/lib/images/save-image"
import { showToast } from "#/stores/toast-store"
import { Button } from "../ui/button"
import { useImagePicker } from "./use-image-picker"

type Props = {
	target: ImageTarget
	// What's there now, image or fallback.
	preview: ReactNode
	hasImage: boolean
	// Title of the crop modal.
	title: string
	hint: string
	// Stacks the buttons under the preview, for a preview too wide to share
	// a row with them (a banner).
	stacked?: boolean
}

// A settings row for one uploadable image: what's there now, plus Change
// (or Upload) and Remove.
export function ImageField({
	target,
	preview,
	hasImage,
	title,
	hint,
	stacked = false,
}: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const picker = useImagePicker(target, title)
	const [removing, setRemoving] = useState(false)

	async function remove() {
		setRemoving(true)
		try {
			await removeImage(target)
			await queryClient.invalidateQueries()
			await router.invalidate()
		} catch (caught) {
			showToast({
				message:
					caught instanceof ImageSaveError
						? caught.message
						: "Couldn't remove the image. Try again.",
			})
		} finally {
			setRemoving(false)
		}
	}

	const actions = (
		<HStack gap="2" flexShrink="0">
			<Button variant="outline" size="sm" onClick={picker.pick}>
				{hasImage ? "Change" : "Upload"}
			</Button>
			{hasImage && (
				<Button
					variant="ghost"
					size="sm"
					loading={removing}
					disabled={removing}
					onClick={remove}
				>
					Remove
				</Button>
			)}
		</HStack>
	)
	const hintEl = (
		<span className={css({ fontSize: "xs", color: "fg.subtle" })}>{hint}</span>
	)

	return (
		<>
			{picker.input}
			{stacked ? (
				<VStack gap="3" alignItems="stretch">
					{preview}
					<HStack
						justify="space-between"
						alignItems="center"
						gap="3"
						flexWrap="wrap"
					>
						{hintEl}
						{actions}
					</HStack>
				</VStack>
			) : (
				<HStack
					justify="space-between"
					alignItems="center"
					gap="3"
					flexWrap="wrap"
				>
					<HStack gap="3" alignItems="center" minWidth="0">
						{preview}
						{hintEl}
					</HStack>
					{actions}
				</HStack>
			)}
		</>
	)
}
