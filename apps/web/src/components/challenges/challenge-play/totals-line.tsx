import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { Totals } from "#/lib/challenge"

export function TotalsLine({
	label,
	totals,
}: {
	label: string
	totals: Totals
}) {
	return (
		<HStack justify="space-between" gap="3" flexWrap="wrap">
			<span className={css({ fontWeight: "semibold" })}>{label}</span>
			<HStack gap="4" className={css({ fontFamily: "mono", fontSize: "sm" })}>
				<span>
					<span
						className={css({ color: "success.default", fontWeight: "bold" })}
					>
						+{totals.best}
					</span>{" "}
					<span className={css({ color: "fg.muted", fontSize: "xs" })}>
						all right
					</span>
				</span>
				<span>
					<span
						className={css({ color: "danger.default", fontWeight: "bold" })}
					>
						{totals.worst === 0 ? "0" : `−${-totals.worst}`}
					</span>{" "}
					<span className={css({ color: "fg.muted", fontSize: "xs" })}>
						all wrong
					</span>
				</span>
			</HStack>
		</HStack>
	)
}
