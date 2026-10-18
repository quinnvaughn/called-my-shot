import { createPortal } from "react-dom"
import { HiGif } from "react-icons/hi2"
import { css, cx } from "styled-system/css"
import { useAnchoredPopover } from "#/components/ui/use-anchored-popover"
import { ComposerBarButton } from "./composer-bar-button"
import { type Gif, GifPicker } from "./gif-picker"

const panel = css({
	zIndex: "popover",
	width: { base: "auto", md: "96" },
	padding: "3",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	borderRadius: "xl",
	boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
})

// Below md the hook leaves placement to the panel: it sits along the bottom
// of the screen instead of hanging off the button.
const mobilePanel = css({
	position: "fixed",
	left: "3",
	right: "3",
	bottom: "3",
})

// The GIF button in the message bar. Opens the picker over the page, with
// nothing dimmed behind it; picking one hands it straight back.
export function GifPopover({
	onPick,
	disabled = false,
}: {
	onPick: (gif: Gif) => void
	disabled?: boolean
}) {
	const popover = useAnchoredPopover()
	return (
		<span ref={popover.rootRef} className={css({ display: "inline-flex" })}>
			<ComposerBarButton
				ref={popover.triggerRef}
				label={popover.open ? "Close GIFs" : "Add a GIF"}
				active={popover.open}
				disabled={disabled}
				onClick={() => (popover.open ? popover.close() : popover.openPopover())}
			>
				<HiGif size={22} />
			</ComposerBarButton>
			{popover.open &&
				createPortal(
					<div
						ref={popover.contentRef}
						role="dialog"
						aria-label="Pick a GIF"
						className={cx(panel, popover.isMobile && mobilePanel)}
						style={popover.contentStyle}
					>
						<GifPicker
							autoFocus
							onSelect={(gif) => {
								popover.close()
								onPick(gif)
							}}
						/>
					</div>,
					document.body,
				)}
		</span>
	)
}
