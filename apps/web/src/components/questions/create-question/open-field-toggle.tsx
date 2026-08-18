import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	checked: boolean
	onChange: (checked: boolean) => void
}

// multiple_choice only. Same switch as OfficialToggle, different question:
// whether this question starts from a fixed, creator-listed option pool or
// an empty one that castCall itself grows as callers pick real teams/players
// not in it yet (see optionsOpenField on the questions table).
export function OpenFieldToggle({ checked, onChange }: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="4">
			<VStack gap="0.5" alignItems="flex-start">
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					Open field
				</span>
				<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
					No preset options - the pool starts empty and grows as callers pick
					real teams or players not in it yet.
				</span>
			</VStack>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label="Open field"
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
