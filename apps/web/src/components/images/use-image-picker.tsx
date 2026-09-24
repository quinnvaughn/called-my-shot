import { useRef } from "react"
import { css } from "styled-system/css"
import { loadImage } from "#/lib/images/crop-to-blob"
import type { ImageTarget } from "#/lib/images/save-image"
import { openModal } from "#/stores/modal-store"
import { showToast } from "#/stores/toast-store"
import { ImageCropModal } from "./image-crop-modal"

// Generous, since the crop step shrinks everything to a few hundred KB before
// upload. This only stops a file the browser would struggle to decode.
const MAX_SOURCE_BYTES = 15 * 1024 * 1024

const hiddenInput = css({ display: "none" })

// A hidden file input plus the function that opens it. Picking a file opens
// the crop modal, which does the upload. Render `input` anywhere in the
// component; call `pick` from whatever button should start it.
export function useImagePicker(target: ImageTarget, title: string) {
	const inputRef = useRef<HTMLInputElement>(null)

	async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		// Cleared so picking the same file again still fires a change.
		event.target.value = ""
		if (!file) return

		if (!file.type.startsWith("image/")) {
			showToast({ message: "That file isn't an image." })
			return
		}
		if (file.size > MAX_SOURCE_BYTES) {
			showToast({ message: "That image is over 15 MB. Pick a smaller one." })
			return
		}

		// Decoded up front so a format this browser can't read (HEIC outside
		// Safari, say) fails here with a message rather than as an empty cropper.
		const probe = URL.createObjectURL(file)
		try {
			await loadImage(probe)
		} catch {
			showToast({
				message: "That image couldn't be opened. Try a JPEG or PNG.",
			})
			return
		} finally {
			URL.revokeObjectURL(probe)
		}
		openModal(<ImageCropModal target={target} file={file} title={title} />)
	}

	return {
		pick: () => inputRef.current?.click(),
		input: (
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				className={hiddenInput}
				onChange={onChange}
			/>
		),
	}
}
