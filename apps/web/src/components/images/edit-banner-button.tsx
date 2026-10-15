import { FiCamera } from "react-icons/fi"
import { css } from "styled-system/css"
import type { ImageTarget } from "#/lib/images/save-image"
import { useImagePicker } from "./use-image-picker"

const cameraButton = css({
	position: "absolute",
	right: "3",
	bottom: "3",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "8",
	height: "8",
	borderRadius: "full",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	color: "fg.muted",
	cursor: "pointer",
	_focusVisible: {
		outline: "2px solid {colors.primary.default}",
		outlineOffset: "2px",
	},
})

export function EditBannerButton({
	hasImage,
	target,
	title,
}: {
	hasImage: boolean
	target: ImageTarget
	title: string
}) {
	const picker = useImagePicker(target, title)
	return (
		<>
			{picker.input}
			<button
				type="button"
				className={cameraButton}
				onClick={picker.pick}
				aria-label={hasImage ? "Change banner" : "Upload banner"}
			>
				<FiCamera size={14} />
			</button>
		</>
	)
}
