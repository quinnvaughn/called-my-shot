// Teammate Chain's og:images. A result (/arcade/teammate-chain/:date/:result)
// is the pair, the chain drawn from the start's headshot to the target's with
// a dot per player between and par marked on it, and chips for the time,
// hints and misses: on the day it names nobody in between, and once
// the day is over a verified sharer's route shows. Today's card
// (/arcade/teammate-chain) is the pair and an empty chain the length of
// par, the dare itself.

import {
	chainDurationLabel,
	chainResultHeadline,
} from "@called-my-shot/schemas"
import { arcadeDay, isArcadeDay } from "../arcade/day"
import { COLOR } from "../brand-palette"
import { el, image, type SatoriNode, svgEl } from "../share-image"
import {
	findChainPuzzleForDay,
	loadChainPlayers,
	loadSharerRoute,
	verifiedChainSharer,
} from "../teammate-chain/load"
import { parseChainResultCode } from "../teammate-chain/play"
import {
	type ArcadePanel,
	arcadeCard,
	arcadeHeadline,
	arcadeSubline,
} from "./arcade-frame"
import { clamp, eyebrow } from "./frame"
import { fetchDataUri } from "./remote-image"

const END_PX = 72
const MIDDLE_FACE_PX = 48
const MIDDLE_PX = 26
const LINK_PX = 40
const PAIR_MAX = 40
const ROUTE_MAX = 44
const SHARER_MAX = 24
const TODAY_HEADLINE_PX = 44
const PAR_MARK_WIDTH = 120
const ICON_PX = 26

// A player drawn on the card: his headshot as a data URI, or null for his
// initials.
export type ChainCardFace = { name: string; image: string | null }

export type TeammateChainCardData = {
	day: string
	league: string
	start: ChainCardFace
	target: ChainCardFace
	par: number
	// Null for a game given up.
	links: number | null
	misses: number
	hints: number
	seconds: number | null
	sharer: string | null
	// Only once the day is over, for a verified sharer who solved it.
	route: ChainCardFace[] | null
}

export type TeammateChainTodayCardData = {
	day: string
	league: string
	start: ChainCardFace
	target: ChainCardFace
	par: number
}

function panel(day: string, league: string): ArcadePanel {
	return {
		color: COLOR.chain,
		title: ["TEAMMATE", "CHAIN"],
		titlePx: 54,
		rule: "Connect two players through teammates, in as few links as you can.",
		day,
		league,
	}
}

function dot(px: number, fill: string | null): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			width: `${px}px`,
			height: `${px}px`,
			borderRadius: "999px",
			backgroundColor: fill ?? COLOR.cardMuted,
			border: `3px solid ${fill ?? COLOR.borderEmphasized}`,
		},
		[],
	)
}

function initialsOf(name: string): string {
	return name
		.split(/\s+/)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("")
		.slice(0, 2)
}

// A player's headshot in a circle, cropped to keep the top of the frame, or
// his initials when there's no photo.
function face(px: number, player: ChainCardFace): SatoriNode {
	const frame = {
		display: "flex",
		width: `${px}px`,
		height: `${px}px`,
		borderRadius: "999px",
		border: `3px solid ${COLOR.ink}`,
		backgroundColor: COLOR.cardMuted,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	}
	if (player.image) {
		return el("div", frame, [
			image(player.image, px, px, {
				objectFit: "cover",
				objectPosition: "top",
			}),
		])
	}
	return el(
		"div",
		{
			...frame,
			fontFamily: "Space Mono",
			fontWeight: 700,
			fontSize: `${Math.round(px / 3)}px`,
			color: COLOR.ink,
		},
		initialsOf(player.name),
	)
}

function link(color: string): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			width: `${LINK_PX}px`,
			height: "6px",
			borderRadius: "3px",
			backgroundColor: color,
		},
		[],
	)
}

// "PAR 3" under the node where the shortest route ends.
function withParMark(node: SatoriNode, px: number, par: number): SatoriNode {
	return el("div", { display: "flex", position: "relative", flexShrink: 0 }, [
		node,
		el(
			"span",
			{
				position: "absolute",
				top: `${px + 8}px`,
				left: `${(px - PAR_MARK_WIDTH) / 2}px`,
				width: `${PAR_MARK_WIDTH}px`,
				display: "flex",
				justifyContent: "center",
				fontFamily: "Space Mono",
				fontWeight: 700,
				fontSize: "18px",
				letterSpacing: "1px",
				color: COLOR.linen,
			},
			`PAR ${par}`,
		),
	])
}

// Feather-style icons, drawn as SVG since the card can't load an icon font.
function icon(color: string, children: SatoriNode[]): SatoriNode {
	return svgEl(
		"svg",
		{
			width: ICON_PX,
			height: ICON_PX,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.5,
			strokeLinecap: "round",
			strokeLinejoin: "round",
		},
		children,
	)
}

const circle = () => svgEl("circle", { cx: 12, cy: 12, r: 10 })

const ICONS = {
	time: () =>
		icon(COLOR.ink, [
			circle(),
			svgEl("polyline", { points: "12 6 12 12 16 14" }),
		]),
	hints: () =>
		icon(COLOR.caution, [
			circle(),
			svgEl("path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }),
			svgEl("line", { x1: 12, y1: 17, x2: 12.01, y2: 17 }),
		]),
	misses: () =>
		icon(COLOR.danger, [
			circle(),
			svgEl("line", { x1: 15, y1: 9, x2: 9, y2: 15 }),
			svgEl("line", { x1: 9, y1: 9, x2: 15, y2: 15 }),
		]),
}

// A number with its icon: the time, the hints, the misses.
function chip(kind: keyof typeof ICONS, value: string): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			alignItems: "center",
			gap: "10px",
			padding: "8px 18px",
			borderRadius: "999px",
			backgroundColor: COLOR.cardMuted,
			border: `1px solid ${COLOR.border}`,
			fontFamily: "Space Mono",
			fontWeight: 700,
			fontSize: "26px",
			color: COLOR.ink,
		},
		[ICONS[kind](), el("span", { display: "flex" }, value)],
	)
}

// The chips a result shows: the time on a solve, then hints and misses only
// when there were any.
function resultChips(data: TeammateChainCardData): SatoriNode[] {
	return [
		...(data.links !== null && data.seconds !== null
			? [chip("time", chainDurationLabel(data.seconds))]
			: []),
		...(data.hints > 0 ? [chip("hints", String(data.hints))] : []),
		...(data.misses > 0 ? [chip("misses", String(data.misses))] : []),
	]
}

// The chain left to right: the start's and target's faces with `middle`
// players between, and "PAR n" under the node where the shortest route
// ends. Solved, it's in the game's color, with any links past par faded the
// way the result screen draws them, and the players' own faces once the
// route can be shown; still to play, the middle is empty; given up, nothing
// joins the two ends.
function chainDiagram(
	ends: { start: ChainCardFace; target: ChainCardFace },
	middle: number,
	kind: "solved" | "empty" | "broken",
	{
		par = Number.POSITIVE_INFINITY,
		route = null,
	}: { par?: number; route?: ChainCardFace[] | null } = {},
): SatoriNode[] {
	const nodes: SatoriNode[] = [face(END_PX, ends.start)]
	if (kind === "broken") {
		nodes.push(
			link(COLOR.borderEmphasized),
			link(COLOR.borderEmphasized),
			face(END_PX, ends.target),
		)
		return nodes
	}
	const mark = (node: SatoriNode, px: number, step: number) =>
		step === par ? withParMark(node, px, par) : node
	for (let step = 1; step <= middle + 1; step++) {
		const past = kind === "solved" && step > par
		nodes.push(
			link(kind === "empty" || past ? COLOR.borderEmphasized : COLOR.chain),
		)
		if (step > middle) {
			nodes.push(mark(face(END_PX, ends.target), END_PX, step))
			continue
		}
		const player = route?.[step - 1]
		nodes.push(
			player
				? mark(face(MIDDLE_FACE_PX, player), MIDDLE_FACE_PX, step)
				: mark(
						dot(
							MIDDLE_PX,
							kind === "empty"
								? null
								: past
									? COLOR.borderEmphasized
									: COLOR.chain,
						),
						MIDDLE_PX,
						step,
					),
		)
	}
	return nodes
}

function pairBlock(label: string, start: string, target: string): SatoriNode {
	return el("div", { display: "flex", flexDirection: "column", gap: "10px" }, [
		eyebrow(label),
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Inter",
				fontWeight: 700,
				fontSize: "30px",
				color: COLOR.ink,
			},
			clamp(`${start} to ${target}`, PAIR_MAX),
		),
	])
}

// The chain, the headline, then the chips and, once a route can be named,
// who's in it.
function chainAndResult(
	row: SatoriNode[],
	headline: SatoriNode,
	chips: SatoriNode[],
	line: string | null = null,
): SatoriNode {
	return el("div", { display: "flex", flexDirection: "column", gap: "22px" }, [
		el(
			"div",
			{ display: "flex", alignItems: "center", paddingBottom: "26px" },
			row,
		),
		el("div", { display: "flex", flexDirection: "column", gap: "14px" }, [
			headline,
			...(chips.length > 0
				? [el("div", { display: "flex", gap: "12px" }, chips)]
				: []),
			...(line ? [arcadeSubline(line)] : []),
		]),
	])
}

export function buildTeammateChainCard(
	data: TeammateChainCardData,
): SatoriNode {
	return arcadeCard(
		panel(data.day, data.league),
		pairBlock(
			data.sharer
				? `@${clamp(data.sharer, SHARER_MAX)} connected`
				: "Connect them",
			data.start.name,
			data.target.name,
		),
		chainAndResult(
			data.links === null
				? chainDiagram(data, 0, "broken")
				: chainDiagram(data, data.links - 1, "solved", {
						par: data.par,
						route: data.route,
					}),
			arcadeHeadline(chainResultHeadline(data.links).toUpperCase()),
			resultChips(data),
			data.route
				? clamp(`Via ${data.route.map((p) => p.name).join(", ")}`, ROUTE_MAX)
				: null,
		),
	)
}

export function buildTeammateChainTodayCard(
	data: TeammateChainTodayCardData,
): SatoriNode {
	return arcadeCard(
		panel(data.day, data.league),
		pairBlock("Today's chain", data.start.name, data.target.name),
		chainAndResult(
			chainDiagram(data, data.par - 1, "empty", { par: data.par }),
			arcadeHeadline("CAN YOU CONNECT THEM?", TODAY_HEADLINE_PX),
			[],
		),
	)
}

// Players' names and headshots, in the order asked for. Null when one is
// missing.
async function faces(
	leagueId: string,
	playerIds: string[],
): Promise<ChainCardFace[] | null> {
	const found = await loadChainPlayers(leagueId, playerIds)
	const players = playerIds.map((id) => found.get(id)?.player)
	if (players.some((player) => !player)) return null
	return Promise.all(
		players.map(async (player) => ({
			name: player?.name ?? "",
			image: await fetchDataUri(player?.headshotUrl ?? null),
		})),
	)
}

async function pairFaces(puzzle: {
	leagueId: string
	startPlayerId: string
	targetPlayerId: string
}) {
	const pair = await faces(puzzle.leagueId, [
		puzzle.startPlayerId,
		puzzle.targetPlayerId,
	])
	const [start, target] = pair ?? []
	return start && target ? { start, target } : null
}

// `result` is the result code a share link carries, "3-1-0-94" or "x-2-1". Null
// for a day with no puzzle, one still to come, or a code no game could have.
// `by` is the username the link names, kept only if it's really theirs.
export async function loadTeammateChainCardData(
	day: string,
	result: string,
	by?: string,
): Promise<TeammateChainCardData | null> {
	if (!isArcadeDay(day)) return null
	const parsed = parseChainResultCode(result)
	if (!parsed) return null
	const today = arcadeDay(new Date())
	if (day > today) return null
	const puzzle = await findChainPuzzleForDay(day)
	if (!puzzle) return null
	const pair = await pairFaces(puzzle)
	if (!pair) return null
	const sharer = by ? await verifiedChainSharer(puzzle, by, result) : null
	const routeIds =
		sharer && day < today ? await loadSharerRoute(puzzle, sharer.id) : null
	const route = routeIds ? await faces(puzzle.leagueId, routeIds) : null
	return {
		day,
		league: puzzle.league.abbreviation,
		...pair,
		par: puzzle.par,
		links: parsed.solved ? parsed.links : null,
		misses: parsed.misses,
		hints: parsed.hints,
		seconds: parsed.solved ? parsed.seconds : null,
		sharer: sharer?.username ?? null,
		route,
	}
}

// Null for a day with no puzzle or one still to come.
export async function loadTeammateChainTodayCardData(
	day: string,
): Promise<TeammateChainTodayCardData | null> {
	if (!isArcadeDay(day) || day > arcadeDay(new Date())) return null
	const puzzle = await findChainPuzzleForDay(day)
	if (!puzzle) return null
	const pair = await pairFaces(puzzle)
	if (!pair) return null
	return {
		day,
		league: puzzle.league.abbreviation,
		...pair,
		par: puzzle.par,
	}
}
