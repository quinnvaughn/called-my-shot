// The og:image behind /user/:username/report-cards/:league/:windowKey. It
// states how a caller did across one window of games: the grade, what the
// return was, the record behind it, and the single best and worst call in it.
//
// Built on the shared og:image frame (see frame.ts).
import { type Grade, SHAPE_FAMILY_LABEL } from "@called-my-shot/scoring"
import { db } from "../../db"
import { COLOR } from "../brand-palette"
import { loadReportCard } from "../report-card/load"
import { el, type SatoriNode } from "../share-image"
import { getLeagueWindows, type WindowDescriptor } from "../windows"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

const WINDOW_LABEL_MAX = 34
const ROW_LABEL_MAX = 22

// Above this many breakdown rows the list steps down a size rather than
// dropping rows - a caller who spread across five families should see all
// five, and the alternative is an image that lies by omission.
const COMPACT_ABOVE = 4

export type ReportCardShareRow = {
	label: string
	wins: number
	losses: number
	returnPct: number | null
}

export type ReportCardShareData = {
	leagueAbbr: string
	windowLabel: string
	name: string
	username: string
	grade: Grade | null
	returnPct: number | null
	wins: number
	losses: number
	netPoints: number
	committedPoints: number
	pendingCount: number
	rows: ReportCardShareRow[]
}

// Matches gradeTone on the web so the page and its preview agree about
// whether a window went well.
function gradeColor(grade: Grade | null): string {
	if (grade === "A+" || grade === "A" || grade === "B") return COLOR.success
	if (grade === "D" || grade === "F") return COLOR.danger
	return COLOR.ink
}

function signedPct(returnPct: number | null): string {
	if (returnPct === null) return "-"
	const rounded = Math.round(returnPct)
	return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded)}%`
}

function breakdownRow(row: ReportCardShareRow, compact: boolean): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			alignItems: "baseline",
			justifyContent: "space-between",
			width: "100%",
			fontSize: compact ? "22px" : "26px",
		},
		[
			el(
				"span",
				{ display: "flex", color: COLOR.ink },
				clamp(row.label, ROW_LABEL_MAX),
			),
			el(
				"div",
				{
					display: "flex",
					gap: compact ? "18px" : "24px",
					fontFamily: "Space Mono",
					color: COLOR.dim,
				},
				[
					el("span", { display: "flex" }, `${row.wins}-${row.losses}`),
					el(
						"span",
						{
							display: "flex",
							color:
								row.returnPct === null
									? COLOR.dim
									: row.returnPct > 0
										? COLOR.success
										: row.returnPct < 0
											? COLOR.danger
											: COLOR.dim,
						},
						signedPct(row.returnPct),
					),
				],
			),
		],
	)
}

export function buildReportCardShareCard(
	data: ReportCardShareData,
): SatoriNode {
	const compact = data.rows.length > COMPACT_ABOVE

	const cells: SatoriNode[] = [
		statCell("Record", `${data.wins}-${data.losses}`),
		statCell("Return", signedPct(data.returnPct), {
			color:
				data.returnPct === null
					? COLOR.ink
					: data.returnPct > 0
						? COLOR.success
						: data.returnPct < 0
							? COLOR.danger
							: COLOR.ink,
			big: true,
		}),
		statCell(
			"Net",
			`${data.netPoints >= 0 ? "+" : "-"}${Math.abs(data.netPoints)}`,
		),
		statCell("Committed", String(data.committedPoints)),
	]

	return cardFrame({
		eyebrow: `${data.leagueAbbr} · ${clamp(data.windowLabel, WINDOW_LABEL_MAX)}`,
		// Grade on the left, breakdown on the right. The grade is the one thing
		// an unfurl has to land in a thumbnail, so it gets the size; the rows
		// are what makes it worth opening.
		hero: el(
			"div",
			{
				display: "flex",
				flex: "1",
				overflow: "hidden",
				alignItems: "center",
				gap: "40px",
				paddingLeft: "36px",
				paddingRight: "36px",
			},
			[
				el(
					"div",
					{
						display: "flex",
						flexDirection: "column",
						gap: "10px",
						width: "320px",
						flexShrink: 0,
					},
					[
						eyebrow(clamp(data.name, PERSON_MAX)),
						el(
							"span",
							{
								display: "flex",
								fontFamily: "Archivo Black",
								fontSize: "150px",
								lineHeight: 1,
								color: gradeColor(data.grade),
							},
							data.grade ?? "-",
						),
						eyebrow(
							data.pendingCount > 0
								? `${data.pendingCount} still out there`
								: "Final",
						),
					],
				),
				el(
					"div",
					{
						display: "flex",
						flexDirection: "column",
						flex: "1",
						gap: compact ? "12px" : "16px",
					},
					data.rows.map((row) => breakdownRow(row, compact)),
				),
			],
		),
		cells,
		username: data.username,
	})
}

// Null when there's nothing to preview: an unknown user or league, a key that
// names no window, or a window this caller has no calls in. The route 404s on
// null rather than rendering an empty image, so an unfurl of a bad link shows
// no preview instead of a blank grade.
export async function loadReportCardShareData(
	username: string,
	leagueSlug: string,
	windowKey: string,
): Promise<ReportCardShareData | null> {
	const [user, league] = await Promise.all([
		db.query.users.findFirst({ where: { username } }),
		db.query.leagues.findFirst({ where: { slug: leagueSlug } }),
	])
	if (!user || !league) return null

	const windows = await getLeagueWindows(league)
	const window: WindowDescriptor | undefined = windows.find(
		(w) => w.key === windowKey,
	)
	if (!window) return null

	const card = await loadReportCard(user.id, league, window)
	if (card.settledCount + card.pendingCount === 0) return null

	return {
		leagueAbbr: league.abbreviation.toUpperCase(),
		windowLabel: window.label,
		name: user.name,
		username: user.username,
		grade: card.grade,
		returnPct: card.returnPct,
		wins: card.wins,
		losses: card.losses,
		netPoints: card.netPoints,
		committedPoints: card.committedPoints,
		pendingCount: card.pendingCount,
		rows: card.byFamily.map((row) => ({
			label: SHAPE_FAMILY_LABEL[row.family],
			wins: row.wins,
			losses: row.losses,
			returnPct: row.returnPct,
		})),
	}
}
