import { css, cx } from "styled-system/css"
import { signTone } from "#/components/ui/sign-tone"
import { formatSigned } from "#/lib/format-number"

export type ReportCardBonusRowData = { label: string; points: number }

// Points earned on top of the calls, sitting in the points column so the
// breakdown still adds up to the NET POINTS tile. No record or return: a
// bonus has neither.
export function ReportCardBonusRow({ row }: { row: ReportCardBonusRowData }) {
	return (
		<div
			className={css({
				gridColumn: "1 / -1",
				display: "grid",
				gridTemplateColumns: "subgrid",
				alignItems: "baseline",
				rowGap: "0.5",
				paddingY: "1.5",
			})}
		>
			<span
				className={css({
					gridColumn: { base: "1 / -1", sm: "1" },
					fontSize: "sm",
					fontWeight: "medium",
					color: "fg.default",
				})}
			>
				{row.label}
			</span>
			<span />
			<span />
			<span
				className={cx(
					css({
						textStyle: "meta",
						whiteSpace: "nowrap",
						textAlign: "right",
					}),
					signTone(row.points),
				)}
			>
				{formatSigned(row.points, { zeroSign: true })}
			</span>
			<span />
		</div>
	)
}
