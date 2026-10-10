// The og:image behind /recaps/:token. A group's week: its name and dates in
// the header, its Player of the Week and then up to three slots in all across
// the hero, and the week's record and biggest climber in the stat row.
//
// Built on the shared og:image frame (see frame.ts).
import { db } from "../../db"
import { COLOR } from "../brand-palette"
import { loadRecapView, type RecapView, signed } from "../group-recap/view"
import { el, type SatoriNode } from "../share-image"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

// Three tiles at most: a fourth would leave each too narrow for a question
// title. The page shows the rest.
const CARD_TILES = 3

// Each tile is about 350px wide, so two lines of the hero's text sizes.
const HEADLINE_MAX = 56
const NOTE_MAX = 64
const TILE_NAME_MAX = 22
const CLIMBER_NAME_MAX = 14
const GROUP_NAME_MAX = PERSON_MAX
// The header eyebrow shares its row with the wordmark, so the name gets less
// room there than anywhere else on the card.
const EYEBROW_NAME_MAX = 28

export type GroupRecapCardTile = {
	label: string
	// Null for Player of the Week, which spans the group's leagues.
	leagueAbbr: string | null
	// Null for a group miss, which names nobody.
	name: string | null
	value: string
	tone: "success" | "danger" | "neutral"
	headline: string
	note: string
}

export type GroupRecapCardData = {
	groupName: string
	weekLabel: string
	wins: number
	losses: number
	accuracy: number | null
	activeMembers: number
	tiles: GroupRecapCardTile[]
	climber: { name: string; places: number } | null
}

const TONE_COLOR = {
	success: COLOR.success,
	danger: COLOR.danger,
	neutral: COLOR.ink,
}

function tile(t: GroupRecapCardTile): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			flexDirection: "column",
			flex: "1",
			minWidth: 0,
			gap: "6px",
			padding: "18px",
			border: `1px solid ${COLOR.border}`,
			borderRadius: "14px",
			backgroundColor: COLOR.cardMuted,
			overflow: "hidden",
		},
		[
			eyebrow(t.leagueAbbr ? `${t.label} · ${t.leagueAbbr}` : t.label),
			el(
				"span",
				{
					display: "flex",
					fontWeight: 600,
					fontSize: "24px",
					color: COLOR.ink,
					marginTop: "4px",
				},
				clamp(t.name ?? "The group", TILE_NAME_MAX),
			),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Archivo Black",
					fontSize: "44px",
					lineHeight: 1.1,
					color: TONE_COLOR[t.tone],
				},
				t.value,
			),
			el(
				"span",
				{
					display: "flex",
					fontSize: "19px",
					lineHeight: 1.3,
					color: COLOR.linen,
				},
				clamp(t.headline, HEADLINE_MAX),
			),
			el(
				"span",
				{
					display: "flex",
					fontSize: "16px",
					lineHeight: 1.3,
					color: COLOR.dim,
				},
				clamp(t.note, NOTE_MAX),
			),
		],
	)
}

export function buildGroupRecapCard(data: GroupRecapCardData): SatoriNode {
	const cells: SatoriNode[] = [
		statCell("Record", `${data.wins}–${data.losses}`, { big: true }),
		statCell("Hit rate", data.accuracy === null ? "-" : `${data.accuracy}%`),
		statCell(
			"Callers",
			`${data.activeMembers} ${data.activeMembers === 1 ? "member" : "members"}`,
		),
	]
	if (data.climber) {
		cells.push(
			statCell(
				"Climber",
				`${clamp(data.climber.name, CLIMBER_NAME_MAX)} ↑${data.climber.places}`,
				{ color: COLOR.secondary },
			),
		)
	}

	const tiles = data.tiles.slice(0, CARD_TILES)
	const hero =
		tiles.length > 0
			? el(
					"div",
					{
						display: "flex",
						flex: "1",
						gap: "16px",
						padding: "22px 36px",
						overflow: "hidden",
					},
					tiles.map(tile),
				)
			: // Every slot can drop out at read time (opt-outs, the worst-miss
				// toggle). The group's name still says whose week this was.
				el(
					"div",
					{
						display: "flex",
						flex: "1",
						alignItems: "center",
						justifyContent: "center",
						fontFamily: "Archivo Black",
						fontSize: "64px",
						color: COLOR.ink,
						padding: "0 36px",
					},
					clamp(data.groupName, GROUP_NAME_MAX),
				)

	return cardFrame({
		eyebrow: `${clamp(data.groupName, EYEBROW_NAME_MAX)} · ${data.weekLabel}`,
		hero,
		cells,
		byline: "Weekly recap",
	})
}

export function recapCardData(view: RecapView): GroupRecapCardData {
	return {
		groupName: view.group.name,
		weekLabel: view.weekLabel,
		wins: view.record.wins,
		losses: view.record.losses,
		accuracy: view.record.accuracy,
		activeMembers: view.record.activeMembers,
		tiles: [
			...view.playersOfTheWeek.map((p) => ({
				label: "Player of the Week",
				leagueAbbr: null,
				name: p.user.name,
				value: signed(p.points),
				tone: "success" as const,
				headline: `${p.wins}–${p.losses} on the week`,
				note:
					view.playersOfTheWeek.length > 1
						? "Tied for the most points in the group."
						: "The most points in the group.",
			})),
			...view.tiles.map((t) => ({
				label: t.label,
				leagueAbbr: t.leagueAbbr,
				name: t.user?.name ?? null,
				value: t.value,
				tone: t.tone,
				headline: t.headline,
				note: t.note,
			})),
		],
		climber: view.climber
			? {
					name: view.climber.user.name,
					places: view.climber.from - view.climber.to,
				}
			: null,
	}
}

// The recap behind a share link, or null when there isn't one to show: an
// unknown token, or a group whose admins turned recap links off.
export async function loadPublicRecapView(
	shareToken: string,
): Promise<RecapView | null> {
	const recap = await db.query.groupRecaps.findFirst({ where: { shareToken } })
	if (!recap) return null
	const group = await db.query.groups.findFirst({
		where: { id: recap.groupId },
	})
	if (!group?.recapLinksEnabled) return null
	return loadRecapView(recap, group)
}

export async function loadGroupRecapCardData(
	shareToken: string,
): Promise<GroupRecapCardData | null> {
	const view = await loadPublicRecapView(shareToken)
	return view ? recapCardData(view) : null
}
