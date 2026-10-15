import { HStack } from "styled-system/jsx"
import { mono, TONE_CLASS } from "./styles"
import { Swatch } from "./swatch"

export function CalendarLegend({ hasPending }: { hasPending: boolean }) {
	return (
		<HStack gap="3" flexWrap="wrap" className={mono}>
			<HStack gap="1">
				<Swatch className={TONE_CLASS.up2} />
				<Swatch className={TONE_CLASS.up4} />
				<span>Up day</span>
			</HStack>
			<HStack gap="1">
				<Swatch className={TONE_CLASS.down2} />
				<Swatch className={TONE_CLASS.down4} />
				<span>Down day</span>
			</HStack>
			{hasPending && (
				<HStack gap="1">
					<Swatch className={TONE_CLASS.pending1} />
					<span>Pending</span>
				</HStack>
			)}
		</HStack>
	)
}
