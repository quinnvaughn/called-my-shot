// The app is dark-only today (panda.config.ts's "light theme: #..." comments
// are leftover notes from an old flip-to-light experiment that was reverted,
// not a live theme anyone can select), so this card renders the same dark
// card-on-canvas look the app shows - not a separate light export that'd look
// like a different product.
//
// This is now an og:image and nothing else. Nobody downloads it, nothing in
// the app renders it: it exists so a /calls/:id link unfurls as the call
// rather than as the house graphic, at the fixed og:image size (see frame.ts).
import { fieldPct, quipForCall } from "@called-my-shot/scoring"
import { and, count, eq } from "drizzle-orm"
import { db } from "../../db"
import { callSelections, calls } from "../../db/schema"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { formatCallDate, loadCallSummaries, quipToneFor } from "./call-summary"
import { cardFrame, clamp, eyebrow, statCell } from "./frame"

// Every free-text field is capped in JS (see clamp). caseText is the
// dangerous one: its column is unbounded, and a paragraph-length case is
// enough to bury the whole footer.
//
// Measured against Archivo Black / Inter at the sizes used below, across the
// card's ~1050px of inner width.
const PICK_HERO_MAX = 22
// The resolved card's text column gives up ~380px to the points panel.
const PICK_HERO_MAX_BESIDE_POINTS = 16
const PICK_MAX = 42
const TITLE_MAX = 100
const CASE_MAX = 150

const POINTS_PANEL_WIDTH = 340

export type CallShareCardData = {
	questionTitle: string
	leagueAbbr: string
	categoryLabel: string
	name: string
	username: string
	pickLabel: string
	// Pre-formatted by formatCallDate (call-summary.ts) - the date is the
	// claim this card exists to make, so it's stated the same way here and on
	// the page.
	calledAt: string
	fieldPct: number | null
	// Numeric guesses only, once the actual value is in. An exact guess is its
	// own kind, since "Off by 0" reads as still being off, and gets its own
	// face. `by` is pre-formatted by formatGuess so a rate stat keeps its three
	// decimals.
	closeness: { kind: "exact" } | { kind: "off"; by: string } | null
	// Replaces the verdict word in the eyebrow when this call's margin was
	// remarkable in either direction - "Inches away", "Never in doubt". Null
	// on the ordinary call. Deliberately eyebrow-only: the footer row already
	// carries up to six statCells at a fixed width and satori clips overflow
	// silently, so the distance itself stays on the page and out of the PNG.
	marginLabel: string | null
	// What the question actually came out to, pre-formatted by
	// buildActualLabel (call-summary.ts). Null where nothing numeric was
	// recorded, same as on the page.
	actual: string | null
	conviction: number
	caseText: string | null
	// Resolved only. Null on all three renders the pending face instead.
	points: number | null
	isWin: boolean | null
	quip: string | null
	// "Awaiting result" / "Locks Jun 2027" - pending only.
	pendingLabel: string | null
	// Set on a win at least STREAK_TAG_MIN into its league-and-family streak.
	streakLength: number | null
}

// The result is the first thing anyone scrolling past an unfurl should read,
// so it gets its own tinted panel beside the pick rather than a cell in the
// footer row at the same weight as the call date.
function pointsPanel(points: number, win: boolean): SatoriNode {
	const color = win ? COLOR.success : COLOR.danger
	const value = `${win ? "+" : "−"}${Math.abs(points)}`
	// Archivo Black digits run ~0.7em wide, so the size steps down with the
	// digit count to stay inside the panel.
	const fontSize =
		value.length <= 4 ? "112px" : value.length === 5 ? "92px" : "72px"
	return el(
		"div",
		{
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			width: `${POINTS_PANEL_WIDTH}px`,
			flexShrink: 0,
			alignSelf: "stretch",
			gap: "6px",
			backgroundColor: win ? COLOR.successSubtle : COLOR.dangerSubtle,
			border: `1px solid ${win ? COLOR.success : COLOR.danger}`,
			borderRadius: "16px",
		},
		[
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Space Mono",
					fontWeight: 700,
					fontSize: "22px",
					letterSpacing: "2px",
					textTransform: "uppercase",
					color,
				},
				win ? "Points won" : "Points lost",
			),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Archivo Black",
					fontSize,
					lineHeight: 1,
					color,
				},
				value,
			),
		],
	)
}

export function buildCallShareCard(data: CallShareCardData): SatoriNode {
	const resolved = data.points !== null && data.isWin !== null
	const win = data.isWin === true
	const nailed = data.closeness?.kind === "exact"
	const textAlign = resolved ? "left" : "center"

	const pick = clamp(data.pickLabel, PICK_MAX)
	// Two sizes rather than one that fits the worst case: "Over 47.5" earns
	// the hero treatment, and "Minnesota Timberwolves" still has to fit next
	// to it without being set at a size only it needs.
	const pickFontSize =
		pick.length <= (resolved ? PICK_HERO_MAX_BESIDE_POINTS : PICK_HERO_MAX)
			? "68px"
			: "44px"

	const body: SatoriNode[] = [
		eyebrow(
			// Same precedence as the page's own eyebrow (call-record-card.tsx):
			// an exact guess keeps "Nailed it" over any margin label, since it
			// is the rarer claim.
			resolved
				? nailed
					? "Nailed it"
					: (data.marginLabel ?? (win ? "Called it" : "Missed"))
				: "On the record",
			resolved
				? win
					? COLOR.primaryDefault
					: COLOR.dim
				: COLOR.primaryDefault,
		),
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Archivo Black",
				fontSize: pickFontSize,
				lineHeight: 1.1,
				textAlign,
				lineClamp: 2,
				// A pending call is not a loss, so it never gets the muted
				// treatment a miss does.
				color: nailed
					? COLOR.primaryDefault
					: resolved && !win
						? COLOR.dim
						: COLOR.ink,
			},
			pick,
		),
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Inter",
				fontSize: "22px",
				lineHeight: 1.3,
				color: COLOR.steel,
				textAlign,
				lineClamp: 2,
			},
			clamp(data.questionTitle, TITLE_MAX),
		),
	]
	if (data.caseText) {
		body.push(
			el(
				"div",
				{
					display: "flex",
					fontFamily: "Inter",
					fontStyle: "italic",
					fontSize: "19px",
					lineHeight: 1.4,
					color: COLOR.linen,
					borderLeft: `3px solid ${COLOR.borderEmphasized}`,
					paddingLeft: "16px",
					marginTop: "6px",
					lineClamp: 2,
				},
				`"${clamp(data.caseText, CASE_MAX)}"`,
			),
		)
	}

	const cells: SatoriNode[] = [statCell("Called", data.calledAt)]
	cells.push(statCell("Conviction", `${Math.round(data.conviction)}%`))
	if (data.actual !== null) {
		cells.push(statCell("Actual", data.actual))
	}
	if (data.fieldPct !== null) {
		cells.push(statCell("Field agreed", `${Math.round(data.fieldPct)}%`))
	}
	if (data.closeness?.kind === "exact") {
		cells.push(
			statCell("Guess vs actual", "Exact", { color: COLOR.primaryDefault }),
		)
	} else if (data.closeness?.kind === "off") {
		cells.push(statCell("Off by", data.closeness.by))
	}
	if (resolved && data.streakLength !== null) {
		cells.push(
			statCell("Streak", `${data.streakLength} in a row`, {
				color: COLOR.success,
			}),
		)
	}
	if (!resolved) {
		cells.push(
			statCell("Status", data.pendingLabel ?? "Awaiting result", {
				color: COLOR.dim,
			}),
		)
	}

	// Hero - takes whatever vertical room the header and footer leave and
	// centres its content in it. overflow: hidden so that a field which
	// somehow beats its cap gets cut off at the band's edge instead of
	// painting over the footer.
	const hero = resolved
		? el(
				"div",
				{
					display: "flex",
					flex: "1",
					overflow: "hidden",
					alignItems: "center",
					gap: "40px",
					paddingTop: "28px",
					paddingBottom: "28px",
					paddingLeft: "48px",
					paddingRight: "36px",
				},
				[
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							flex: "1",
							overflow: "hidden",
							alignItems: "flex-start",
							justifyContent: "center",
							gap: "10px",
						},
						body,
					),
					pointsPanel(data.points ?? 0, win),
				],
			)
		: el(
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
				body,
			)

	return cardFrame({
		eyebrow: `${data.leagueAbbr} · ${data.categoryLabel}`,
		hero,
		cells,
		username: data.username,
		quip: data.quip ?? "",
		borderColor: nailed ? COLOR.primaryDefault : COLOR.border,
	})
}

// Null for an unknown call. Deliberately NOT gated on the question being
// resolved: a call made a year before it settles is exactly the one worth
// linking to, so an unresolved call gets a pending face rather than a 404.
// loadCallSummaries (not loadResolvedCallSummaries) is what allows that; the
// resolution digest still uses the resolved-only view, because an email
// announcing a result must never describe a call that has none.
export async function loadCallShareCardData(
	callId: string,
): Promise<CallShareCardData | null> {
	// Shared with the resolution digest (lib/email-digest.ts) - same query,
	// same pick label and points, so the card and the email can never disagree
	// about a call.
	const summary = (await loadCallSummaries([callId])).get(callId)
	if (!summary) return null

	// Same "Field agreed only means something for a lone selection" rule as
	// the /calls/:id page. A numeric guess is too specific for anyone to share
	// it (and has no selection, so soleOptionId is already null), and
	// player_season_award/team_season_award's several independent picks have
	// no single number. Left out of loadResolvedCallSummaries because it needs
	// its own per-question aggregate queries and only this card shows it.
	let fieldPctValue: number | null = null
	if (summary.soleOptionId) {
		const [{ n: totalCalls }] = await db
			.select({ n: count() })
			.from(calls)
			.where(eq(calls.questionId, summary.questionId))
		const [{ n: optionCallCount }] = await db
			.select({ n: count() })
			.from(callSelections)
			.innerJoin(calls, eq(calls.id, callSelections.callId))
			.where(
				and(
					eq(calls.questionId, summary.questionId),
					eq(callSelections.optionId, summary.soleOptionId),
				),
			)
		fieldPctValue = fieldPct(optionCallCount, totalCalls)
	}

	const resolved = summary.points !== null && summary.isWin !== null

	return {
		questionTitle: summary.questionTitle,
		leagueAbbr: summary.leagueAbbr,
		categoryLabel: summary.shapeLabel,
		name: summary.userName,
		username: summary.username,
		pickLabel: summary.pickLabel,
		calledAt: formatCallDate(summary.createdAt),
		isWin: summary.isWin,
		points: summary.points,
		fieldPct: fieldPctValue,
		closeness: summary.closeness,
		marginLabel: summary.margin?.label ?? null,
		actual: summary.actual,
		conviction: summary.conviction,
		caseText: summary.caseText,
		// There is no quip for a call nobody has graded, and inventing one
		// would be the kind of filler the loss quips exist to avoid. Only two
		// of the four margins get a pool of their own - see QuipTone.
		quip: resolved
			? quipForCall(
					summary.callId,
					quipToneFor(summary.isWin === true, summary.margin),
				)
			: null,
		pendingLabel: resolved
			? null
			: summary.questionStatus === "open"
				? `Locks ${formatCallDate(summary.locksAt)}`
				: "Awaiting result",
		streakLength: summary.streakLength,
	}
}
