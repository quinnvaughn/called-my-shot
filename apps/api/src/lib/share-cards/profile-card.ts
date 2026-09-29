// The og:image behind /user/:username. The hero is the results calendar,
// the same grid the profile leads with: one square per day, green for a day
// that netted points, red for one that lost them, darker for a bigger day.
//
// Built on the shared og:image frame (see frame.ts).
import {
	type CalendarLevel,
	calendarSteps,
	calendarTone,
} from "@called-my-shot/scoring"
import { DateTime } from "luxon"
import { db } from "../../db"
import { COLOR } from "../brand-palette"
import { buildGlobalLeaderboard } from "../global-leaderboard"
import { el, type SatoriNode } from "../share-image"
import { buildUserRecord, loadUserRecordInputs } from "../user-record"
import { cardFrame, clamp, PERSON_MAX, statCell } from "./frame"

export const PROFILE_CARD_WEEKS = 26

// 26 columns of 32 + 6 is 982px, inside the 1056 the frame's padding leaves.
// 7 rows plus the month labels come to 288px, inside the ~336px hero band.
const CELL = 32
const GAP = 6

export type ProfileShareDay = {
	day: string
	settledCount: number
	netPoints: number
}

export type ProfileShareData = {
	name: string
	username: string
	totalPoints: number
	rank: number | null
	accuracy: number | null
	wins: number
	losses: number
	activeDays: number
	startDay: string
	endDay: string
	days: ProfileShareDay[]
}

// Blends an accent over the card surface. satori has no color-mix, so the
// four shades are worked out here.
function mix(accent: string, amount: number): string {
	const channel = (hex: string, i: number) =>
		Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
	return `#${[0, 1, 2]
		.map((i) =>
			Math.round(
				channel(COLOR.card, i) +
					(channel(accent, i) - channel(COLOR.card, i)) * amount,
			)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`
}

const LEVEL_AMOUNT: Record<CalendarLevel, number> = {
	1: 0.35,
	2: 0.55,
	3: 0.78,
	4: 1,
}

function cellStyle(
	day: ProfileShareDay | undefined,
	steps: [number, number, number],
): Record<string, string> {
	const base = {
		display: "flex",
		width: `${CELL}px`,
		height: `${CELL}px`,
		borderRadius: "6px",
	}
	if (!day) return { ...base, backgroundColor: COLOR.cardMuted }
	const tone = calendarTone(day, steps)
	if (tone.side === "pending") {
		return {
			...base,
			backgroundColor: COLOR.cardMuted,
			border: `2px solid ${COLOR.borderEmphasized}`,
		}
	}
	if (tone.side === "even") return { ...base, backgroundColor: COLOR.steel }
	const accent = tone.side === "up" ? COLOR.success : COLOR.danger
	return { ...base, backgroundColor: mix(accent, LEVEL_AMOUNT[tone.level]) }
}

function formatPoints(points: number): string {
	return points.toLocaleString("en-US")
}

export function buildProfileShareCard(data: ProfileShareData): SatoriNode {
	const byDay = new Map(data.days.map((day) => [day.day, day]))
	const steps = calendarSteps(data.days)
	const start = DateTime.fromISO(data.startDay)
	const end = DateTime.fromISO(data.endDay)

	const columns: SatoriNode[] = []
	const monthLabels: SatoriNode[] = []
	let lastMonth: number | null = null
	for (let week = 0; week < PROFILE_CARD_WEEKS; week++) {
		const weekStart = start.plus({ weeks: week })
		const cells: SatoriNode[] = []
		for (let weekday = 0; weekday < 7; weekday++) {
			const date = weekStart.plus({ days: weekday })
			// Days after today keep their slot so the last column lines up with
			// the rest, but draw nothing.
			if (date > end) {
				cells.push(
					el("div", {
						display: "flex",
						width: `${CELL}px`,
						height: `${CELL}px`,
					}),
				)
				continue
			}
			cells.push(el("div", cellStyle(byDay.get(date.toISODate() ?? ""), steps)))
		}
		columns.push(
			el(
				"div",
				{ display: "flex", flexDirection: "column", gap: `${GAP}px` },
				cells,
			),
		)
		// Labelled on the first column that reaches a new month.
		const month = weekStart.plus({ days: 6 }).month
		const label =
			month !== lastMonth ? weekStart.plus({ days: 6 }).toFormat("LLL") : ""
		lastMonth = month
		monthLabels.push(
			el(
				"span",
				{
					display: "flex",
					width: `${CELL}px`,
					fontFamily: "Space Mono",
					fontSize: "15px",
					color: COLOR.dim,
					textTransform: "uppercase",
					whiteSpace: "nowrap",
				},
				label,
			),
		)
	}

	const hero = el(
		"div",
		{
			display: "flex",
			flex: "1",
			overflow: "hidden",
			flexDirection: "column",
			justifyContent: "center",
			alignItems: "center",
			gap: "8px",
		},
		[
			el("div", { display: "flex", gap: `${GAP}px` }, monthLabels),
			el("div", { display: "flex", gap: `${GAP}px` }, columns),
		],
	)

	return cardFrame({
		eyebrow: `${clamp(data.name, PERSON_MAX)} · Last ${PROFILE_CARD_WEEKS} weeks`,
		hero,
		cells: [
			statCell("Points", formatPoints(data.totalPoints), { big: true }),
			statCell("Rank", data.rank !== null ? `#${data.rank}` : "-"),
			statCell("Record", `${data.wins}-${data.losses}`),
			statCell(
				"Accuracy",
				data.accuracy !== null ? `${Math.round(data.accuracy)}%` : "-",
			),
			statCell("Days called", String(data.activeDays)),
		],
		username: data.username,
	})
}

// Null for an unknown user or one with no calls yet, so the route 404s and
// the profile unfurls with no preview rather than an empty grid.
export async function loadProfileShareCardData(
	username: string,
): Promise<ProfileShareData | null> {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) return null

	// Same all-time board User.careerStats resolves from.
	const [inputs, board] = await Promise.all([
		loadUserRecordInputs(user.id),
		buildGlobalLeaderboard({ leagueId: null }),
	])
	const entry = board.find((e) => e.user.id === user.id)
	if (!entry) return null

	const record = buildUserRecord(inputs, {
		leagueId: null,
		weeks: PROFILE_CARD_WEEKS,
		now: new Date(),
	})

	return {
		name: user.name,
		username: user.username,
		totalPoints: entry.totalPoints,
		rank: entry.rank,
		accuracy: entry.accuracy,
		wins: record.wins,
		losses: record.losses,
		activeDays: record.calendar.activeDays,
		startDay: record.calendar.startDay,
		endDay: record.calendar.endDay,
		days: record.calendar.days,
	}
}
