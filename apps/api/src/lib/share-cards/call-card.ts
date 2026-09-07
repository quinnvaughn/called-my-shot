// The app is dark-only today (panda.config.ts's "light theme: #..." comments
// are leftover notes from an old flip-to-light experiment that was reverted,
// not a live theme anyone can select), so this card renders the same dark
// card-on-canvas look the in-app preview shows - not a separate light export
// that'd look like a different product.
import { COLOR } from "../brand-palette"
import { brandWordmark } from "./brand-wordmark"
import { el, type SatoriNode } from "../share-image"

// Same "fixed export resolution, independent of whatever the in-app preview
// happens to render at" reasoning as user-card.ts - this PNG is only ever
// downloaded/copied elsewhere, never displayed in-app.
const REFERENCE_WIDTH = 475
const TARGET_WIDTH = 1200
const SCALE = TARGET_WIDTH / REFERENCE_WIDTH
export const CALL_SHARE_CARD_SIZE = { width: TARGET_WIDTH }

function px(n: number): string {
	return `${Math.round(n * SCALE)}px`
}

export type CallShareCardData = {
	questionTitle: string
	leagueAbbr: string
	categoryLabel: string
	name: string
	username: string
	pickLabel: string
	isWin: boolean
	points: number
	fieldPct: number | null
	conviction: number
	caseText: string | null
	quip: string
}

// Mirrors eyebrow() in user-card.ts.
function eyebrow(text: string, color = COLOR.dim): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			fontFamily: "Space Mono",
			fontWeight: 500,
			fontSize: px(11),
			letterSpacing: px(0.5),
			textTransform: "uppercase",
			color,
		},
		text,
	)
}

// Mirrors CallShareCardPreview's ShareStatRow.
function statRow(label: string, value: string): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			width: "100%",
		},
		[
			eyebrow(label),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontWeight: 600,
					fontSize: px(14),
				},
				value,
			),
		],
	)
}

export function buildCallShareCard(data: CallShareCardData): SatoriNode {
	const initial = data.name.charAt(0).toUpperCase()
	const resultColor = data.isWin ? COLOR.success : COLOR.danger

	const body: SatoriNode[] = []
	if (data.caseText) {
		body.push(
			el(
				"div",
				{
					display: "flex",
					fontFamily: "Inter",
					fontStyle: "italic",
					fontSize: px(12),
					color: COLOR.linen,
					borderLeft: `${px(2)} solid ${COLOR.borderEmphasized}`,
					paddingLeft: px(12),
				},
				`"${data.caseText}"`,
			),
		)
	}
	if (data.fieldPct !== null) {
		body.push(statRow("Field agreed", `${Math.round(data.fieldPct)}%`))
	}
	body.push(statRow("Conviction", `${Math.round(data.conviction)}%`))
	body.push(
		el(
			"div",
			{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "baseline",
				width: "100%",
				borderTop: `${px(1)} solid ${COLOR.border}`,
				paddingTop: px(12),
			},
			[
				eyebrow("Result"),
				el(
					"span",
					{
						display: "flex",
						fontFamily: "Archivo Black",
						fontSize: px(30),
						color: resultColor,
					},
					`${data.isWin ? "+" : "−"}${Math.abs(data.points)} pts`,
				),
			],
		),
	)
	body.push(
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Inter",
				fontStyle: "italic",
				fontSize: px(12),
				color: COLOR.steel,
				textAlign: "center",
				width: "100%",
				justifyContent: "center",
			},
			data.quip,
		),
	)

	return el(
		"div",
		{
			display: "flex",
			flexDirection: "column",
			width: `${CALL_SHARE_CARD_SIZE.width}px`,
			backgroundColor: COLOR.card,
			color: COLOR.ink,
			border: `${px(1)} solid ${COLOR.border}`,
			borderRadius: px(16),
			fontFamily: "Inter",
		},
		[
			// Header
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					// Without this, brandWordmark's row stretches to the header's
					// full width (column flex's default cross-axis stretch) and
					// sits left-aligned inside it - the nested "pick/hero" div
					// sets its own centering, but brandWordmark itself doesn't, so
					// it needs the parent to center it instead.
					alignItems: "center",
					gap: px(16),
					padding: px(16),
					borderBottom: `${px(1)} solid ${COLOR.border}`,
				},
				[
					brandWordmark(px, SCALE),
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: px(6),
						},
						[
							eyebrow(
								data.isWin ? "Called it" : "Missed",
								data.isWin ? COLOR.primaryDefault : COLOR.dim,
							),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Archivo Black",
									fontSize: px(24),
									textAlign: "center",
									color: data.isWin ? COLOR.ink : COLOR.dim,
								},
								data.pickLabel,
							),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Inter",
									fontSize: px(12),
									color: COLOR.steel,
									textAlign: "center",
								},
								data.questionTitle,
							),
						],
					),
					el(
						"div",
						{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: px(8),
						},
						[
							el(
								"div",
								{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									width: px(20),
									height: px(20),
									borderRadius: px(10),
									backgroundColor: COLOR.cardMuted,
									border: `${px(1)} solid ${COLOR.border}`,
									fontFamily: "Space Mono",
									fontSize: px(9),
									color: COLOR.ink,
								},
								initial,
							),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Space Mono",
									fontSize: px(12),
									color: COLOR.dim,
								},
								`@${data.username}`,
							),
						],
					),
				],
			),
			// Body
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					gap: px(12),
					padding: px(16),
				},
				body,
			),
			// Footer
			el(
				"div",
				{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: px(16),
					borderTop: `${px(1)} solid ${COLOR.border}`,
					fontFamily: "Space Mono",
					fontSize: px(11),
					color: COLOR.dim,
				},
				[
					el("span", { display: "flex" }, `calledmyshot.com/${data.username}`),
					el(
						"span",
						{ display: "flex" },
						`${data.leagueAbbr} · ${data.categoryLabel}`,
					),
				],
			),
		],
	)
}
