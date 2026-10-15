import { css } from "styled-system/css"

// Heading for a run of members sharing a section ("AFC · East" on a win
// totals ballot). Drawn only where the value changes from the row above, so
// a ballot whose members have no section (most of them - awards, a week of
// games) renders exactly as it did before sections existed. Deliberately
// not a container around its rows: members stay one flat list in sortOrder,
// which is what keeps prev/next nav and the progress math indifferent to
// whether a ballot is grouped at all.
export function BallotSectionHeading({ label }: { label: string }) {
	return (
		<span
			className={css({
				textStyle: "label",
				fontWeight: "bold",
				color: "fg.subtle",
				backgroundColor: "bg.subtle",
				borderBottom: "1px solid {colors.border.default}",
				paddingInline: "3",
				paddingBlock: "2",
			})}
		>
			{label}
		</span>
	)
}
