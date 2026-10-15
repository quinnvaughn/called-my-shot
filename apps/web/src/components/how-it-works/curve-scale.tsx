import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

// Both the contrarian tier and the early-call bonus scale smoothly (no fixed
// bands or cutoffs) - these labels are just a rough, human-readable read on
// where a given multiplier falls, not a lookup table. CurveScale shows the
// floor and ceiling multiplier with the label progression between them, to
// communicate the shape without asserting exact breakpoints that don't exist.
export function CurveScale({
	labels,
	floorMult,
	ceilingMult,
}: {
	labels: string[]
	floorMult: string
	ceilingMult: string
}) {
	return (
		<VStack alignItems="stretch" gap="1.5">
			<HStack
				justify="space-between"
				gap="2"
				className={css({
					background: "bg.canvas",
					border: "1px solid {colors.border.default}",
					borderRadius: "md",
					padding: "{spacing.2.5} {spacing.3.5}",
				})}
			>
				{labels.map((label, i) => (
					<HStack key={label} gap="2" alignItems="center">
						{i > 0 && (
							<span className={css({ color: "fg.subtle", fontSize: "2xs" })}>
								→
							</span>
						)}
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								fontWeight: "bold",
								letterSpacing: "wide",
								whiteSpace: "nowrap",
							})}
						>
							{label}
						</span>
					</HStack>
				))}
			</HStack>
			<HStack justify="space-between" gap="2" paddingInline="1">
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{floorMult} floor
				</span>
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{ceilingMult} ceiling
				</span>
			</HStack>
		</VStack>
	)
}
