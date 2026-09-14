// The app is dark-only today (panda.config.ts's "light theme: #..." comments
// are leftover notes from an old flip-to-light experiment that was reverted,
// not a live theme anyone can select), so this card renders the same dark
// card-on-canvas look the app shows - not a separate light export that'd look
// like a different product.
//
// This is now an og:image and nothing else. Nobody downloads it, nothing in
// the app renders it: it exists so a /calls/:id link unfurls as the call
// rather than as the house graphic. That's what fixes the dimensions below.
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"

// 1200x630 exactly, because that is what X's summary_large_image crops to.
// The card used to render 1200 wide at whatever height its content needed
// (~1060), and every unfurl of it lost the top and bottom 40% - the pick and
// the points, i.e. all of it.
//
// Every size below is a real pixel at that resolution. The other share cards
// are authored against a 475px reference and scaled up, because they mirror
// an in-app React component that renders at that width; this one mirrors
// nothing (see the file header), so the indirection would only be a way to
// get the arithmetic wrong.
const TARGET_WIDTH = 1200
const TARGET_HEIGHT = 630
export const CALL_SHARE_CARD_SIZE = {
	width: TARGET_WIDTH,
	height: TARGET_HEIGHT,
}

// brandWordmark measures against its caller's own reference width, so it
// takes a px()/scale pair. 1.7 puts the lockup at 34px, in scale with the
// header rule beside it.
const WORDMARK_SCALE = 1.7
const wordmarkPx = (n: number) => `${Math.round(n * WORDMARK_SCALE)}px`

// Given a fixed height, satori clips anything that doesn't fit the viewBox -
// silently, with no warning and no scaling, and an overflowing flex child
// paints straight over its siblings rather than pushing them. So every
// free-text field on this card is capped in JS rather than trusted to wrap
// into whatever space is left. caseText is the dangerous one: its column is
// unbounded, and a paragraph-length case is enough to bury the whole footer.
export function clamp(text: string, max: number): string {
	if (text.length <= max) return text
	return `${text.slice(0, max - 1).trimEnd()}…`
}

// Measured against Archivo Black / Inter at the sizes used below, across the
// card's ~1050px of inner width.
const PICK_HERO_MAX = 22
// The resolved card's text column gives up ~380px to the points panel.
const PICK_HERO_MAX_BESIDE_POINTS = 16
const PICK_MAX = 42
const TITLE_MAX = 100
const CASE_MAX = 150

const HEADER_HEIGHT = 96
const FOOTER_HEIGHT = 168
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

export function eyebrow(text: string, color = COLOR.dim): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			fontFamily: "Space Mono",
			fontWeight: 500,
			fontSize: "17px",
			letterSpacing: "1px",
			textTransform: "uppercase",
			color,
		},
		text,
	)
}

// The footer's unit: a label stacked over a value. Horizontal, unlike the
// full-width label/value rows the portrait card used - four of those stacked
// vertically is precisely the height this layout doesn't have.
export function statCell(
	label: string,
	value: string,
	{ color = COLOR.ink, big = false }: { color?: string; big?: boolean } = {},
): SatoriNode {
	return el("div", { display: "flex", flexDirection: "column", gap: "8px" }, [
		eyebrow(label),
		el(
			"span",
			{
				display: "flex",
				fontFamily: big ? "Archivo Black" : "Inter",
				fontWeight: 600,
				fontSize: big ? "40px" : "28px",
				color,
			},
			value,
		),
	])
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
			resolved
				? nailed
					? "Nailed it"
					: win
						? "Called it"
						: "Missed"
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

	return el(
		"div",
		{
			// Opaque and full-bleed. The rounded card is inset inside this
			// instead of being the root itself: at a fixed size, a border-radius
			// on the outermost node leaves transparent PNG corners, which X
			// composites onto white and Discord onto near-black - the same file
			// showing two different frames.
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
					border: `1px solid ${nailed ? COLOR.primaryDefault : COLOR.border}`,
					borderRadius: "20px",
				},
				[
					// Header. Fixed height, like the footer - the hero between
					// them is the only band allowed to absorb slack, so a long
					// pick can never push either of them off the card.
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
							eyebrow(`${data.leagueAbbr} · ${data.categoryLabel}`),
						],
					),
					// Hero - takes whatever vertical room the header and footer
					// leave and centres its content in it. overflow: hidden so
					// that a field which somehow beats its cap gets cut off at
					// the band's edge instead of painting over the footer.
					resolved
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
							),
					// Footer
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
									el(
										"span",
										{ display: "flex", fontStyle: "italic" },
										data.quip ?? "",
									),
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
