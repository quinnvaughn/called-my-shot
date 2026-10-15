import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	checked: boolean
	onChange: (checked: boolean) => void
	// player_season_award/team_season_award/player_award_finalists require
	// isOfficial - forced on and non-interactive for those shapes rather than
	// hidden, so it's still visible that the question is going out official.
	disabled?: boolean
}

// Only rendered by the caller when the viewer is an admin - no gating logic
// lives here, this is just the switch itself.
export function OfficialToggle({ checked, onChange, disabled }: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="4">
			<VStack gap="0.5" alignItems="flex-start">
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					Mark as Official
				</span>
				<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
					{disabled
						? "Required for this shape - there's no fixed nominee list to curate from, so this always posts official."
						: "Posts under the platform account with the OFFICIAL badge instead of your own handle."}
				</span>
			</VStack>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label="Mark as official"
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={cx(
					css({
						position: "relative",
						width: "42px",
						height: "24px",
						flexShrink: 0,
						borderRadius: "full",
						bg: "bg.subtle",
						border: "1px solid {colors.border.default}",
						transition: "background-color 0.15s ease, border-color 0.15s ease",
						_after: {
							content: '""',
							position: "absolute",
							top: "1px",
							left: "1px",
							width: "18px",
							height: "18px",
							borderRadius: "full",
							bg: "fg.subtle",
							transition: "transform 0.15s ease, background-color 0.15s ease",
						},
					}),
					checked &&
						css({
							bg: "primary.subtle",
							border: "1px solid {colors.primary.default}",
							_after: {
								transform: "translateX(18px)",
								bg: "primary.default",
							},
						}),
					disabled && css({ opacity: 0.6, cursor: "not-allowed" }),
				)}
			/>
		</HStack>
	)
}
