// The og:image behind /user/:username/report-cards/:league/:windowKey. It
// states how a caller did across one window of games: the grade, what the
// return was, the record behind it, and the single best and worst call in it.
//
// Same fixed 1200x630 and header/hero/footer bands as call-card.ts and
// sweep-card.ts, built from their shared eyebrow/statCell pieces so the
// images read as one set.
import { type Grade, SHAPE_FAMILY_LABEL } from "@called-my-shot/scoring"
import { db } from "../../db"
import {
	getLeagueWindows,
	type WindowDescriptor,
} from "../../graphql/types/sports/windows"
import { COLOR } from "../brand-palette"
import { loadReportCard } from "../report-card/load"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"
import { clamp, eyebrow, statCell } from "./call-card"

const TARGET_WIDTH = 1200
const TARGET_HEIGHT = 630
export const REPORT_CARD_SHARE_CARD_SIZE = {
	width: TARGET_WIDTH,
	height: TARGET_HEIGHT,
}

const WORDMARK_SCALE = 1.7
const wordmarkPx = (n: number) => `${Math.round(n * WORDMARK_SCALE)}px`

const PERSON_MAX = 40
const WINDOW_LABEL_MAX = 34
const ROW_LABEL_MAX = 22

const HEADER_HEIGHT = 96
const FOOTER_HEIGHT = 168

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

	return el(
		"div",
		{
			display: "flex",
			width: `${TARGET_WIDTH}px`,
			height: `${TARGET_HEIGHT}px`,
			padding: "14px",
			backgroundColor: COLOR.paper,
			fontFamily: "Inter",
		},
		[
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					flex: "1",
					backgroundColor: COLOR.card,
					color: COLOR.ink,
					border: `1px solid ${COLOR.border}`,
					borderRadius: "20px",
				},
				[
					el(
						"div",
						{
							display: "flex",
							height: `${HEADER_HEIGHT}px`,
							flexShrink: 0,
							alignItems: "center",
							justifyContent: "space-between",
							paddingLeft: "36px",
							paddingRight: "36px",
							borderBottom: `1px solid ${COLOR.border}`,
						},
						[
							brandWordmark(wordmarkPx, WORDMARK_SCALE),
							eyebrow(
								`${data.leagueAbbr} · ${clamp(data.windowLabel, WINDOW_LABEL_MAX)}`,
							),
						],
					),
					// Grade on the left, breakdown on the right. The grade is the
					// one thing an unfurl has to land in a thumbnail, so it gets
					// the size; the rows are what makes it worth opening.
					el(
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
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							height: `${FOOTER_HEIGHT}px`,
							flexShrink: 0,
							justifyContent: "center",
							gap: "18px",
							paddingLeft: "36px",
							paddingRight: "36px",
							borderTop: `1px solid ${COLOR.border}`,
						},
						[
							el(
								"div",
								{
									display: "flex",
									alignItems: "flex-end",
									justifyContent: "space-between",
									width: "100%",
								},
								cells,
							),
							el(
								"div",
								{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									width: "100%",
									fontFamily: "Space Mono",
									fontSize: "17px",
									color: COLOR.dim,
								},
								[
									el("span", { display: "flex" }, `@${data.username}`),
									el("span", { display: "flex" }, "calledmyshot.com"),
								],
							),
						],
					),
				],
			),
		],
	)
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
