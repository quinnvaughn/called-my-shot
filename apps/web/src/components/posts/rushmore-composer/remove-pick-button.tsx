import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"

// The small x on a picked face in the composer, which takes that player off
// so the spot opens up again.
export function RemovePickButton({
	name,
	onRemove,
}: {
	name: string
	onRemove: () => void
}) {
	return (
		<button
			type="button"
			aria-label={`Remove ${name}`}
			onClick={onRemove}
			className={css({
				display: "grid",
				placeItems: "center",
				width: "6",
				height: "6",
				borderRadius: "full",
				bg: "bg.canvas",
				color: "fg.default",
				border: "1px solid {colors.border.default}",
				cursor: "pointer",
				_hover: { bg: "bg.subtle" },
			})}
		>
			<FiX size={12} />
		</button>
	)
}
