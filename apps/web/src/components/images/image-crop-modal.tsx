import { IMAGE_DIMENSIONS } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { cropToBlob } from "#/lib/images/crop-to-blob"
import {
	ImageSaveError,
	type ImageTarget,
	saveImage,
} from "#/lib/images/save-image"
import { closeModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { FormError } from "../ui/form-error"
import { Modal } from "../ui/modal"
import { Slider } from "../ui/slider"

type Props = {
	target: ImageTarget
	file: File
	title: string
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3

const cropArea = css({
	position: "relative",
	width: "full",
	height: "72",
	borderRadius: "md",
	overflow: "hidden",
	bg: "bg.subtle",
})

// The picked image under a frame the shape it'll be saved as: round for an
// avatar, square for a logo, 4:1 for a banner. Drag to move, pinch, scroll
// or the slider to zoom.
export function ImageCropModal({ target, file, title }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const [crop, setCrop] = useState({ x: 0, y: 0 })
	const [zoom, setZoom] = useState(MIN_ZOOM)
	const [area, setArea] = useState<Area | null>(null)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Created and revoked by the same effect, so a StrictMode remount gets a
	// fresh URL instead of one its own cleanup already revoked.
	const [src, setSrc] = useState<string | null>(null)
	useEffect(() => {
		const url = URL.createObjectURL(file)
		setSrc(url)
		return () => URL.revokeObjectURL(url)
	}, [file])

	const size = IMAGE_DIMENSIONS[target.kind]

	async function save() {
		if (!area || !src) return
		setSaving(true)
		setError(null)
		try {
			const blob = await cropToBlob(src, area, size)
			await saveImage(target, blob)
			await queryClient.invalidateQueries()
			await router.invalidate()
			closeModal()
		} catch (caught) {
			setError(
				caught instanceof ImageSaveError
					? caught.message
					: "Couldn't save the image. Try again.",
			)
			setSaving(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{title}</Modal.Title>
			<VStack gap="3.5" alignItems="stretch">
				<div className={cropArea}>
					{src && (
						<Cropper
							image={src}
							crop={crop}
							zoom={zoom}
							minZoom={MIN_ZOOM}
							maxZoom={MAX_ZOOM}
							aspect={size.width / size.height}
							cropShape={target.kind === "avatar" ? "round" : "rect"}
							showGrid={false}
							onCropChange={setCrop}
							onZoomChange={setZoom}
							onCropComplete={(_, pixels) => setArea(pixels)}
						/>
					)}
				</div>
				{/* The slider only steps in whole numbers, so it runs in hundredths. */}
				<Slider
					aria-label="Zoom"
					min={MIN_ZOOM * 100}
					max={MAX_ZOOM * 100}
					value={Math.round(zoom * 100)}
					onChange={(value) => setZoom(value / 100)}
				/>
				<Button
					variant="solid"
					size="md"
					fullWidth
					loading={saving}
					disabled={saving || !area}
					onClick={save}
				>
					Save
				</Button>
				<FormError message={error} />
			</VStack>
		</Modal>
	)
}
