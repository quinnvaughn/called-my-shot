import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import type { Gif } from "./gif-picker"

// A GIF waiting in the message bar to go out with the next send, and the
// way to take it back off.
export function AttachedGif({
	gif,
	onRemove,
}: {
	gif: Gif
	onRemove: () => void
}) {
	return (
		<div
			className={css({
				position: "relative",
				// Only as wide as the GIF, so the remove button sits on its corner.
				width: "fit-content",
				borderRadius: "md",
				overflow: "hidden",
			})}
		>
			<img
				src={gif.url}
				alt={gif.alt}
				width={gif.width}
				height={gif.height}
				className={css({
					display: "block",
					height: "36",
					width: "auto",
					maxWidth: "full",
				})}
			/>
			<button
				type="button"
				aria-label="Remove GIF"
				onClick={onRemove}
				className={css({
					position: "absolute",
					top: "1",
					right: "1",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "6",
					height: "6",
					borderRadius: "full",
					bg: "bg.canvas/80",
					color: "fg.default",
					cursor: "pointer",
					_hover: { bg: "bg.canvas" },
				})}
			>
				<FiX size={14} />
			</button>
		</div>
	)
}
