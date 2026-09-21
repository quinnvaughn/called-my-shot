import { css } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { formatReturn, returnTone } from "#/lib/report-card"

export type ReportCardRowData = {
	label: string
	wins: number
	losses: number
	pendingCount: number
	netPoints: number
	returnPct: number | null
}

type Props = {
	row: ReportCardRowData
	// A shape row sitting under its family row, indented and quieter.
	nested?: boolean
}

// One line of the breakdown, used at both grains: a family row on the card,
// and the shape rows nested under it on the permalink. Same component so a
// family and the shapes inside it can't come out formatted differently.
export function ReportCardRow({ row, nested = false }: Props) {
	const settled = row.wins + row.losses
	const returnText = formatReturn(row.returnPct)
	return (
		<Flex
			direction={{ base: "column", sm: "row" }}
			justify="space-between"
			alignItems={{ base: "flex-start", sm: "baseline" }}
			gap={{ base: "0.5", sm: "3" }}
			className={css({
				paddingY: "1.5",
				paddingLeft: nested ? "4" : "0",
			})}
		>
			<span
				className={css({
					fontSize: nested ? "xs" : "sm",
					fontWeight: nested ? "normal" : "medium",
					color: nested ? "fg.muted" : "fg.default",
				})}
			>
				{row.label}
			</span>
			<HStack
				gap="3"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					// One unbreakable run, so a record never splits across lines
					// from the points beside it.
					whiteSpace: "nowrap",
				})}
			>
				<span className={css({ color: "fg.muted" })}>
					{settled > 0 ? formatRecord(row.wins, row.losses) : "-"}
					{row.pendingCount > 0 ? ` · ${row.pendingCount} open` : ""}
				</span>
				{settled > 0 && (
					<>
						<span className={css({ color: returnTone(row.netPoints) })}>
							{formatSignedPoints(row.netPoints)}
						</span>
						{returnText && (
							<span
								className={css({
									color: returnTone(row.returnPct),
									minWidth: "3.5rem",
									textAlign: "right",
								})}
							>
								{returnText}
							</span>
						)}
					</>
				)}
			</HStack>
		</Flex>
	)
}

// The breakdown as a whole. On the inline card every row is a family. On the
// permalink each family is followed by every shape inside it, so the rows
// stay at one predictable grain.
export function ReportCardBreakdown({
	families,
	shapesByFamily,
}: {
	families: (ReportCardRowData & { family: string })[]
	// Omitted on the inline card, which stays at family grain. Supplied on the
	// permalink, where there's room for the finer read.
	shapesByFamily?: Record<string, ReportCardRowData[]>
}) {
	if (families.length === 0) return null
	return (
		<VStack
			gap="0"
			alignItems="stretch"
			className={css({
				borderTop: "1px solid {colors.border.default}",
				paddingTop: "2",
			})}
		>
			{families.map((family) => {
				const shapes = shapesByFamily?.[family.family] ?? []
				return (
					<div key={family.family}>
						<ReportCardRow row={family} />
						{/* Every shape, including a family that holds only one.
						    Repeating the parent's numbers there is the point: it
						    says the family IS that shape, which is information the
						    family row alone doesn't carry. Suppressing it made a
						    page where one family split and three didn't read as
						    arbitrary. */}
						{shapes.map((shape) => (
							<ReportCardRow key={shape.label} row={shape} nested />
						))}
					</div>
				)
			})}
		</VStack>
	)
}
