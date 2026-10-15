import { FiCamera } from "react-icons/fi"
import { css } from "styled-system/css"
import { useImagePicker } from "#/components/images/use-image-picker"
import { Avatar } from "#/components/ui/avatar"

const avatarButton = css({
	position: "relative",
	flexShrink: 0,
	borderRadius: "full",
	cursor: "pointer",
	_focusVisible: {
		outline: "2px solid {colors.primary.default}",
		outlineOffset: "2px",
	},
})

const cameraBadge = css({
	position: "absolute",
	right: "-0.5",
	bottom: "-0.5",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "6",
	height: "6",
	borderRadius: "full",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	color: "fg.muted",
})

// The viewer's own avatar on their profile opens the picker directly. The
// camera badge is what says it's clickable.
export function EditableAvatar({
	name,
	avatarUrl,
}: {
	name: string
	avatarUrl: string | null
}) {
	const picker = useImagePicker({ kind: "avatar" }, "Avatar")
	return (
		<>
			{picker.input}
			<button
				type="button"
				className={avatarButton}
				onClick={picker.pick}
				aria-label={avatarUrl ? "Change avatar" : "Upload avatar"}
			>
				<Avatar size="lg" name={name} src={avatarUrl} />
				<span className={cameraBadge}>
					<FiCamera size={12} />
				</span>
			</button>
		</>
	)
}
