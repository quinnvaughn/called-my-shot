import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

// A box's label, with what moved its number off the plain rate beside it.
export function BoxLabel({ label, note }: { label: string; note?: string }) {
	return (
		<HStack justify="space-between" gap="2" width="full">
			<span
				className={css({
					textStyle: "meta",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			{note && (
				<span
					className={css({
						textStyle: "meta",
						color: "fg.muted",
					})}
				>
					{note}
				</span>
			)}
		</HStack>
	)
}
