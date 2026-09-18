// The og:image behind /user/:username/streaks/:league/:family. It states one
// league-and-family run: how long it is, the best it has been, when the run
// began and the last call that extended it.
//
// Same fixed 1200x630 and header/hero/footer bands as call-card.ts, for the
// same reasons documented there, and built from its eyebrow/statCell pieces
// so the cards read as one set.
import {
	resolveStreakMode,
	STREAK_FAMILIES,
	STREAK_FAMILY_LABEL,
	type StreakFamily,
	type StreakMode,
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

// Which side of the track the card is about. A track can only be live on one
// of them at a time, so the mode is settled when the data is loaded.
export type StreakCardMode = "hot" | "cold"

export type StreakShareCardData = {
	leagueAbbr: string
	familyLabel: string
	name: string
	username: string
	mode: StreakCardMode
	currentLength: number
	bestLength: number
	currentColdLength: number
	worstColdLength: number
	// The run the hero states: the live one while it's going, the record one
	// once it isn't. Pre-formatted by formatCallDate.
	runStartedAt: string | null
	// That run's most recent call: its last win on a hot card, its last miss
	// on a cold one.
	lastCall: { pickLabel: string; questionTitle: string } | null
}

// "7 in a row" while a run is going, "4 misses in a row" on a cold card. A
// track whose newest call went the other way has no live run to state, so it
// leads with the record instead and the line under it says so.
export function streakHero(data: StreakShareCardData): string {
	if (data.mode === "cold") {
		const n =
			data.currentColdLength > 0 ? data.currentColdLength : data.worstColdLength
		return `${n} ${n === 1 ? "miss" : "misses"} in a row`
	}
	const n = data.currentLength > 0 ? data.currentLength : data.bestLength
	return `${n} in a row`
}

function lastCallCell(
	call: StreakShareCardData["lastCall"],
	label: string,
): SatoriNode {
	if (!call) return statCell(label, "-", { color: COLOR.dim })
	return el(
		"div",
		{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "440px" },
		[
			eyebrow(label),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontWeight: 600,
					fontSize: "28px",
					color: COLOR.ink,
				},
				clamp(call.pickLabel, LAST_HIT_PICK_MAX),
			),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontSize: "18px",
					color: COLOR.steel,
				},
				clamp(call.questionTitle, LAST_HIT_TITLE_MAX),
			),
		],
	)
}

export function buildStreakShareCard(data: StreakShareCardData): SatoriNode {
	const cold = data.mode === "cold"
	// Whether the run this card leads with is the one still going. A cold card
	// is only ever made for a live cold run, so it always is.
	const going = cold ? data.currentColdLength > 0 : data.currentLength > 0
	const runLength = cold
		? data.currentColdLength || data.worstColdLength
		: data.currentLength || data.bestLength
	const track = `${data.leagueAbbr} ${data.familyLabel}`

	const cells: SatoriNode[] = cold
		? [
				statCell("Cold", String(data.currentColdLength), {
					color: going ? COLOR.danger : COLOR.dim,
				}),
				statCell("Worst", String(data.worstColdLength)),
				statCell("Started", data.runStartedAt ?? "-"),
				lastCallCell(data.lastCall, "Last miss"),
			]
		: [
				statCell("Current", String(data.currentLength), {
					color: going ? COLOR.success : COLOR.dim,
				}),
				statCell("Best", String(data.bestLength)),
				statCell("Run started", data.runStartedAt ?? "-"),
				lastCallCell(data.lastCall, "Last hit"),
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
								`${data.leagueAbbr} · ${data.familyLabel} ${cold ? "cold streak" : "streak"}`,
							),
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
								streakHero(data),
							),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Inter",
									fontSize: "24px",
									color: COLOR.steel,
								},
								cold
									? `${track} call${runLength === 1 ? "" : "s"} wrong`
									: going
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

export function parseStreakMode(param: string | undefined): StreakMode | null {
	return param === "hot" || param === "cold" ? param : null
}

// Null when there's nothing worth a card: an unknown user, league or family,
// or a track where neither side clears its floor. `requested` is the side the
// page asked for, so the card and the page never disagree about which run
// they're showing.
export async function loadStreakShareCardData(
	username: string,
	leagueSlug: string,
	familyParam: string,
	requested: StreakMode | null = null,
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
	if (!streak) return null
	const mode = resolveStreakMode(streak, requested)
	if (!mode) return null

	const cold = mode === "cold"
	const going = cold ? true : streak.currentLength > 0
	const startCallId = cold
		? streak.currentColdStartCallId
		: going
			? streak.currentStartCallId
			: streak.bestStartCallId
	const endCallId = cold
		? streak.currentColdEndCallId
		: going
			? streak.currentEndCallId
			: streak.bestEndCallId

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
		mode,
		currentLength: streak.currentLength,
		bestLength: streak.bestLength,
		currentColdLength: streak.currentColdLength,
		worstColdLength: streak.worstColdLength,
		runStartedAt: startCall ? formatCallDate(startCall.createdAt) : null,
		lastCall: last
			? { pickLabel: last.pickLabel, questionTitle: last.questionTitle }
			: null,
	}
}
