import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { InfoTip } from "#/components/ui/info-tip"

export function CallRecordStatRow({
	label,
	value,
	hint,
}: {
	label: string
	value: string
	hint?: string
}) {
	return (
		<HStack alignItems="center" justify="space-between" width="full">
			<HStack gap="1" alignItems="center">
				<Eyebrow size="sm" variant="neutral">
					{label}
				</Eyebrow>
				{hint && <InfoTip label={label.toLowerCase()} text={hint} />}
			</HStack>
			<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
				{value}
			</span>
		</HStack>
	)
}
