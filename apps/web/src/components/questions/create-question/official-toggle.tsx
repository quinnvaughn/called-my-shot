import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	checked: boolean
	onChange: (checked: boolean) => void
}

// Only rendered by the caller when the viewer is an admin - no gating logic
// lives here, this is just the switch itself.
export function OfficialToggle({ checked, onChange }: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="4">
			<VStack gap="0.5" alignItems="flex-start">
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					Mark as Official
				</span>
				<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
					Posts under the platform account with the OFFICIAL badge instead of
					your own handle.
				</span>
			</VStack>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label="Mark as official"
				onClick={() => onChange(!checked)}
				className={cx(
					css({
						position: "relative",
						width: "42px",
						height: "24px",
						flexShrink: 0,
						borderRadius: "full",
						bg: "bg.subtle",
						border: "1px solid",
						borderColor: "border.default",
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
							borderColor: "primary.default",
							_after: {
								transform: "translateX(18px)",
								bg: "primary.default",
							},
						}),
				)}
			/>
		</HStack>
	)
}
