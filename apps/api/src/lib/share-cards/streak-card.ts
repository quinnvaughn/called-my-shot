// The og:image behind /user/:username/streaks/:league/:family. It states one
// league-and-family run: how long it is, the best it has been, when the run
// began and the last call that extended it.
//
// Same fixed 1200x630 and header/hero/footer bands as call-card.ts, for the
// same reasons documented there, and built from its eyebrow/statCell pieces
// so the cards read as one set.
import {
	STREAK_FAMILIES,
	STREAK_FAMILY_LABEL,
	type StreakFamily,
} from "@called-my-shot/scoring"
import { db } from "../../db"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"
import { clamp, eyebrow, statCell } from "./call-card"
import { formatCallDate, loadCallSummaries } from "./call-summary"

const TARGET_WIDTH = 1200
const TARGET_HEIGHT = 630
export const STREAK_SHARE_CARD_SIZE = {
	width: TARGET_WIDTH,
	height: TARGET_HEIGHT,
}

const WORDMARK_SCALE = 1.7
const wordmarkPx = (n: number) => `${Math.round(n * WORDMARK_SCALE)}px`

const PERSON_MAX = 40
// The last-hit cell shares the footer row with three short cells, which
// leaves it roughly 420px: a pick at 28px and a title at 18px.
const LAST_HIT_PICK_MAX = 24
const LAST_HIT_TITLE_MAX = 40

const HEADER_HEIGHT = 96
const FOOTER_HEIGHT = 168

export type StreakShareCardData = {
	leagueAbbr: string
	familyLabel: string
	name: string
	username: string
	currentLength: number
	bestLength: number
	// The run the hero states: the current one while it's going, the best one
	// once it isn't. Pre-formatted by formatCallDate.
	runStartedAt: string | null
	// That run's most recent win.
	lastHit: { pickLabel: string; questionTitle: string } | null
}

// "7 in a row" while a run is going. A track whose newest call missed has no
// current run to state, so it leads with the best one instead, and the line
// under it names that as the best run.
export function streakHero(currentLength: number, bestLength: number): string {
	return `${currentLength > 0 ? currentLength : bestLength} in a row`
}

function lastHitCell(hit: StreakShareCardData["lastHit"]): SatoriNode {
	if (!hit) return statCell("Last hit", "-", { color: COLOR.dim })
	return el(
		"div",
		{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "440px" },
		[
			eyebrow("Last hit"),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontWeight: 600,
					fontSize: "28px",
					color: COLOR.ink,
				},
				clamp(hit.pickLabel, LAST_HIT_PICK_MAX),
			),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontSize: "18px",
					color: COLOR.steel,
				},
				clamp(hit.questionTitle, LAST_HIT_TITLE_MAX),
			),
		],
	)
}

export function buildStreakShareCard(data: StreakShareCardData): SatoriNode {
	const going = data.currentLength > 0
	const runLength = going ? data.currentLength : data.bestLength
	const track = `${data.leagueAbbr} ${data.familyLabel}`

	const cells: SatoriNode[] = [
		statCell("Current", String(data.currentLength), {
			color: going ? COLOR.success : COLOR.dim,
		}),
		statCell("Best", String(data.bestLength)),
		statCell("Run started", data.runStartedAt ?? "-"),
		lastHitCell(data.lastHit),
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
							eyebrow(`${data.leagueAbbr} · ${data.familyLabel} streak`),
						],
					),
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							flex: "1",
							overflow: "hidden",
							alignItems: "center",
							justifyContent: "center",
							gap: "10px",
							paddingLeft: "48px",
							paddingRight: "48px",
						},
						[
							eyebrow(clamp(data.name, PERSON_MAX)),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Archivo Black",
									fontSize: "120px",
									lineHeight: 1,
									color: COLOR.ink,
								},
								streakHero(data.currentLength, data.bestLength),
							),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Inter",
									fontSize: "24px",
									color: COLOR.steel,
								},
								going
									? `${track} call${runLength === 1 ? "" : "s"} right`
									: `Best run on ${track}`,
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
							gap: "14px",
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

export function parseStreakFamily(param: string): StreakFamily | null {
	return (STREAK_FAMILIES as readonly string[]).includes(param)
		? (param as StreakFamily)
		: null
}

// Null when there's nothing worth a card: an unknown user, league or family,
// or a track whose best run never got past a single call.
export async function loadStreakShareCardData(
	username: string,
	leagueSlug: string,
	familyParam: string,
): Promise<StreakShareCardData | null> {
	const family = parseStreakFamily(familyParam)
	if (!family) return null
	const [user, league] = await Promise.all([
		db.query.users.findFirst({ where: { username } }),
		db.query.leagues.findFirst({ where: { slug: leagueSlug } }),
	])
	if (!user || !league) return null

	const streak = await db.query.userStreaks.findFirst({
		where: { userId: user.id, leagueId: league.id, family },
	})
	if (!streak || streak.bestLength < 2) return null

	const going = streak.currentLength > 0
	const startCallId = going ? streak.currentStartCallId : streak.bestStartCallId
	const endCallId = going ? streak.currentEndCallId : streak.bestEndCallId

	const [startCall, summaries] = await Promise.all([
		startCallId
			? db.query.calls.findFirst({
					where: { id: startCallId },
					columns: { createdAt: true },
				})
			: null,
		loadCallSummaries(endCallId ? [endCallId] : []),
	])
	const last = endCallId ? summaries.get(endCallId) : undefined

	return {
		leagueAbbr: league.abbreviation.toUpperCase(),
		familyLabel: STREAK_FAMILY_LABEL[family],
		name: user.name,
		username: user.username,
		currentLength: streak.currentLength,
		bestLength: streak.bestLength,
		runStartedAt: startCall ? formatCallDate(startCall.createdAt) : null,
		lastHit: last
			? { pickLabel: last.pickLabel, questionTitle: last.questionTitle }
			: null,
	}
}
