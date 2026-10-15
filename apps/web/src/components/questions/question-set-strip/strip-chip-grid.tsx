import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { sectionRuns } from "#/lib/section-runs"
import { SetChip } from "./set-chip"
import type { QuestionSetMember } from "./types"

// A chip is a bordered, filled, mono-3xs box; a caption set in the same mono
// 3xs with no box of its own still reads as one more chip in the row, just an
// unstyled one. So the caption gets a treatment of its own rather than the
// absence of the chip's: widest tracking, and a hairline rule under it
// spanning its cluster - a section marker, which nothing clickable in this
// card has. Not dimmed any further to separate it: fg.subtle is already the
// bottom of the fg scale (see panda.config.ts) and anything under it stops
// being readable.
const sectionCaptionClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "widest",
	textTransform: "uppercase",
	color: "fg.subtle",
	whiteSpace: "nowrap",
	width: "full",
	paddingBottom: "1",
	borderBottom: "1px solid {colors.border.default}",
})

// The grid is at the section level, not the chip level: equal auto-fit
// columns, so clusters line up with each other and the column count follows
// the card width rather than the content. Chips inside a cluster keep their
// natural width - forcing them onto a shared column count sizes every
// cluster's cells to the widest section in the set, which on an All-Pro
// ballot (9/5/6) squeezed a four-character slot into a cell too narrow to
// hold it. Each run of a section starts a new cluster, so a group boundary
// always starts a new line instead of wrapping wherever the row runs out of
// room. An ungrouped set is one captionless run, which collapses to a single
// full-width cluster: a plain wrapping row.
export function StripChipGrid({
	members,
	currentIndex,
}: {
	members: QuestionSetMember[]
	currentIndex: number
}) {
	return (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
				columnGap: "4",
				rowGap: "3",
				alignItems: "start",
			})}
		>
			{sectionRuns(members).map((run) => (
				<VStack key={run.section ?? "ungrouped"} gap="1" alignItems="stretch">
					{run.section && (
						<span className={sectionCaptionClass}>{run.section}</span>
					)}
					<HStack gap="1.5" flexWrap="wrap">
						{run.entries.map(({ item: member, index }) => (
							<SetChip
								key={member.key}
								member={member}
								isCurrent={index === currentIndex}
							/>
						))}
					</HStack>
				</VStack>
			))}
		</div>
	)
}
