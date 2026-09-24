import { useRef } from "react"
import { createPortal } from "react-dom"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { closeModal } from "#/stores/modal-store"
import { useDialogBehavior } from "./use-dialog-behavior"

const overlay = css({
	position: "fixed",
	inset: 0,
	zIndex: "overlay",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: { base: "4", md: "10" },
	bg: "bg.overlay/90",
})

const image = css({
	maxWidth: "full",
	maxHeight: "full",
	objectFit: "contain",
	borderRadius: "md",
})

const closeButton = css({
	position: "absolute",
	top: "4",
	right: "4",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "10",
	height: "10",
	borderRadius: "full",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	color: "fg.default",
	cursor: "pointer",
})

// An image at full size over a dark scrim. Opened with openModal, so Escape,
// the close button, and clicking anywhere off the image all close it.
export function ImageLightbox({ src, alt }: { src: string; alt: string }) {
	const containerRef = useRef<HTMLDivElement>(null)
	useDialogBehavior(containerRef)

	return createPortal(
		// biome-ignore lint/a11y/useKeyWithClickEvents: click-outside-to-close scrim; keyboard users close via Escape or the close button
		<div
			ref={containerRef}
			className={overlay}
			role="dialog"
			aria-modal="true"
			aria-label={alt}
			onClick={(event) => {
				if (event.target === event.currentTarget) closeModal()
			}}
		>
			<button
				type="button"
				className={closeButton}
				aria-label="Close"
				onClick={closeModal}
			>
				<FiX size={18} />
			</button>
			<img src={src} alt={alt} className={image} />
		</div>,
		document.body,
	)
}
