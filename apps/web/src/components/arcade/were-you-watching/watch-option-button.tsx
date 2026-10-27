import { css } from "styled-system/css"
import { PlayerHeadshot } from "#/components/ui/player-headshot"

type Option = {
	label: string
	player?: { name: string; headshotUrl?: string | null } | null
}

// One of a question's four choices. While the question is up it's a button;
// once answered it marks the right one, and the player's pick when it
// wasn't.
export function WatchOptionButton({
	option,
	state = "open",
	disabled = false,
	onChoose,
}: {
	option: Option
	state?: "open" | "right" | "picked_wrong" | "other"
	disabled?: boolean
	onChoose?: () => void
}) {
	return (
		<button
			type="button"
			disabled={disabled || state !== "open"}
			onClick={onChoose}
			aria-label={
				state === "right"
					? `${option.label}, the answer`
					: state === "picked_wrong"
						? `${option.label}, your pick`
						: option.label
			}
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				width: "full",
				minHeight: "14",
				padding: "{spacing.3} {spacing.4}",
				borderRadius: "xl",
				textAlign: "left",
				fontWeight: "semibold",
				bg: "bg.surface",
				color: "fg.default",
				border: "1px solid {colors.border.emphasized}",
				cursor: "pointer",
				transition: "border-color 0.1s ease, transform 0.1s ease",
				_hover: { _enabled: { borderColor: "primary.default" } },
				_active: { _enabled: { transform: "scale(0.98)" } },
				_disabled: { cursor: "default" },
				"&[data-state=right]": {
					borderColor: "success.default",
					bg: "success.subtle",
				},
				"&[data-state=picked_wrong]": {
					borderColor: "danger.default",
					bg: "danger.subtle",
				},
				"&[data-state=other]": { color: "fg.muted" },
			})}
			data-state={state}
		>
			{option.player && (
				<PlayerHeadshot
					name={option.player.name}
					src={option.player.headshotUrl}
				/>
			)}
			<span>{option.label}</span>
		</button>
	)
}
