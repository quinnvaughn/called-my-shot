import { VStack } from "styled-system/jsx"
import { kickerClass } from "./styles"

export function HeroStat({
	value,
	label,
	valueClass,
}: {
	value: string
	label: string
	valueClass: string
}) {
	return (
		<VStack gap="1.5" alignItems="flex-start">
			<span className={valueClass}>{value}</span>
			<span className={kickerClass}>{label}</span>
		</VStack>
	)
}
