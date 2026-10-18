import type {
	StatContextCard_StatContextFragment,
	StatContextCard_TrackRecordFragment,
} from "#/graphql/generated/graphql"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"

export type Subject = StatContextCard_StatContextFragment["subjects"][number]
export type Matchup = NonNullable<
	StatContextCard_StatContextFragment["matchup"]
>
export type MatchupSide = Matchup["sides"][number]

// Thresholds are deliberately low. A bar set where a sport's own early season
// can't reach it blanks the card exactly when the little that exists is most
// wanted: in week 2 of an NFL season nobody has three games.
//
// The game strip needs two games to be a strip rather than a restatement of
// the headline.
export const MIN_LOG = 2
// "1 of 1" is not a rate. Two is, so that's the floor - the same point every
// other figure here starts averaging at.
const MIN_HIT_RATE = 2
// A split needs two games on each side, or it's just two games relabelled.
const MIN_PER_SIDE = 2
// A record needs two games to be a record rather than a restatement of one
// result - and the strip below already shows that one, with its score on it.
const MIN_RECORD = 2
// "W1" is the last result wearing a different hat. Two is the shortest run
// worth calling a streak.
const MIN_STREAK = 2
// How many results the matchup strip shows, against the ten the server sends.
// Ten of these are wider than a player's game log - each carries a score and an
// opponent, not one number - so ten wrapped to four rows and buried the figures
// under them. The last ten is still on the card, as a record in a tile.
export const MATCHUP_RESULTS = 5

export type TeamLabels = Record<string, string>

// A fixed section name so the card is recognisable page to page, with the stat
// as a qualifier on it. The stat appears exactly once, which is what lets every
// label below stay a short inherited qualifier.
export function sectionTitle(statLabel: string): string {
	return statLabel ? `The stats \u00b7 ${statLabel}` : "The stats"
}

export function round(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

// Position codes are written plural when they name a group of players: "WR"
// becomes "WRs". Codes already ending in S ("SS") are left alone.
function plural(position: string): string {
	return position.endsWith("S") ? position : `${position}s`
}

// The number this whole card is about, and the qualifier on it. The stat
// itself is NOT named here - the card's heading says it once, and every label
// under it inherits it. That's what lets these stay short while staying
// generic: "last game" works for receiving yards, hits and rebounds alike,
// where anything self-sufficient would have to name the stat every time.
export type Headline = { value: string; label: string }

export function headline(subject: Subject): Headline | null {
	const played = subject.recentGames.filter(
		(g) => !g.didNotPlay && g.value !== null,
	)
	if (played.length === 0) return null

	if (played.length === 1) {
		return { value: round(played[0]?.value ?? 0), label: "last game" }
	}
	const mean =
		played.reduce((sum, g) => sum + (g.value ?? 0), 0) / played.length
	return {
		value: round(mean),
		label: `per game, last ${played.length}`,
	}
}

// A number and what it is, never a sentence. The stat is never named again -
// the headline above already said what these are measured in, and repeating
// "receiving yards" in every row is most of what made the first version
// unreadable.
//
// A thin sample is shown rather than hidden. Only a figure that is genuinely
// meaningless at low n is withheld: a hit rate of 1 of 1 isn't a rate, and a
// home/away split with one game a side is two games relabelled, which the
// strip above already shows.
export type Tile = { value: string; label: string }

export function supportingTiles(subject: Subject, teams: TeamLabels): Tile[] {
	const tiles: Tile[] = []

	const season = subject.seasonToDate
	if (season && season.games >= MIN_HIT_RATE && season.overLine !== null) {
		tiles.push({
			value: `${season.overLine} of ${season.games}`,
			label: "cleared the line",
		})
	}

	// Ahead of the splits below, and the share ahead of the count, because the
	// compact card keeps only the first two tiles. Volume is the steadiest
	// thing on this card: yards move week to week and the targets or carries
	// behind them mostly don't, so a share of the team's is the figure most
	// likely to still hold on Sunday.
	//
	// Two tiles rather than one because they answer different objections. The
	// count is volume whoever else is on the field; the share is volume that
	// survives a game script. Both name the column they are counted in, since
	// neither is the stat the headline is measured in.
	const usage = subject.usage
	if (usage) {
		tiles.push({
			value: `${round(usage.sharePct)}%`,
			label:
				usage.games === 1
					? `of team ${usage.label}, last game`
					: `of team ${usage.label}`,
		})
		tiles.push({
			value: round(usage.perGame),
			label:
				usage.games === 1
					? `${usage.label}, last game`
					: `${usage.label} per game`,
		})
	}

	if (
		subject.home &&
		subject.away &&
		subject.home.games >= MIN_PER_SIDE &&
		subject.away.games >= MIN_PER_SIDE
	) {
		tiles.push({
			value: `${round(subject.home.mean)} / ${round(subject.away.mean)}`,
			label: "home / away",
		})
	}

	const rest = subject.rest
	if (
		rest?.shortRest &&
		rest.longRest &&
		rest.shortRest.games >= MIN_PER_SIDE &&
		rest.longRest.games >= MIN_PER_SIDE
	) {
		tiles.push({
			value: `${round(rest.longRest.mean)} / ${round(rest.shortRest.mean)}`,
			label: `${round(rest.medianRestDays)}+ days rest / less`,
		})
	}

	const share = subject.teamShare
	if (share) {
		tiles.push({
			value: `${round(share.sharePct)}%`,
			label: share.games === 1 ? "of team total, last game" : "of team total",
		})
	}

	const allowed = subject.opponentAllowed
	if (allowed) {
		// Past tense, which agrees with any subject - the earlier "ATL allow"
		// was only broken because the present tense has to agree with a team
		// name. The opposing team IS named here even though the matchup
		// header shows it, because without it the number reads as something
		// the subject's own team gave up. The span is spelled out for the
		// same reason: 124 over one game and 124 a game are different claims.
		const who = teams[allowed.teamId] ?? "opponent"
		const positions = allowed.positions.map(plural).join("/")
		const to = positions ? ` to ${positions}` : ""
		tiles.push({
			value: round(allowed.meanAllowed),
			label:
				allowed.games === 1
					? `${who} allowed${to}, last game`
					: `${who} allowed${to}, per game`,
		})
	}

	return tiles
}

// What each side of the game gives up in the pooled stat. Two tiles rather
// than a column on the list: the number belongs to the defense, not to the
// player, and repeating it down five rows would say the same thing twice
// while burying which of the two is the softer spot.
export function defenseTiles(
	defenses: StatContextCard_StatContextFragment["defenses"],
	teams: TeamLabels,
): Tile[] {
	return defenses.map((defense) => ({
		value: round(defense.meanAllowed),
		label:
			defense.games === 1
				? `${teams[defense.teamId] ?? "opponent"} allowed, last game`
				: `${teams[defense.teamId] ?? "opponent"} allowed, per game`,
	}))
}

export const OUTCOME_LETTER = { WIN: "W", LOSS: "L", TIE: "T" } as const

// The four scoring-gap metrics, by the name each sport actually uses. The
// server decides which one a league gets (lib/stat-context/differential.ts);
// this is only how it is written and formatted, and the two halves have to
// stay in step - a net rating is a rate to one decimal, where a season total
// is a whole number and wears its sign.
const DIFFERENTIAL_LABEL = {
	NET_RATING: "net rating",
	RUN_DIFFERENTIAL: "run differential",
	POINT_DIFFERENTIAL: "point differential",
	GOAL_DIFFERENTIAL: "goal differential",
} as const

// What this side is about, and what it is measured over.
//
// Never the won-lost record: the matchup header sits directly above this card
// and already prints it, so leading with it spends the biggest number here on
// something the viewer read a moment ago. Margin is the number that isn't up
// there, and it separates two teams better than their records do - a 9-7 at
// +6 a game and a 9-7 at -1 are not the same team.
export function matchupHeadline(
	side: MatchupSide,
	focus: Matchup["focus"],
): Headline | null {
	const overall = side.overall
	// An average over one game is that game, which the strip below already
	// shows, with its actual score on it rather than a mean of one.
	if (!overall || overall.games < MIN_RECORD) return null

	if (focus === "SCORING") {
		return {
			value: round(overall.pointsForPerGame + overall.pointsAgainstPerGame),
			label: `combined per game, ${overall.games} ${pluralize(overall.games, "game")}`,
		}
	}

	// No standings reading from before this question locked, so there is no
	// differential to lead with. The results strip below still stands on its own.
	const differential = side.differential
	if (!differential) return null
	return {
		// A rate reads to a decimal; a season total is counted in whole runs or
		// points, never 80.5 of them. Either way the sign is the part that says
		// which way it ran.
		value: formatSigned(differential.value, {
			round: differential.kind === "NET_RATING" ? "tenth" : "whole",
		}),
		label: `${DIFFERENTIAL_LABEL[differential.kind]}, ${differential.games} ${pluralize(differential.games, "game")}`,
	}
}

// The headline figure for each side of the card, one line apiece, for the
// phone's folded summary (StatContextSummary): a pool's front-runners, each
// team in a matchup, or each player or team the question is about. `name` is
// whose figure it is; `value` and `label` are the headline itself. Rows with
// no headline are left out rather than shown blank.
export type SummaryRow = { key: string; name: string } & Headline

const SUMMARY_RANKING = 3

export function summaryRows(
	context: Pick<
		StatContextCard_StatContextFragment,
		"ranking" | "matchup" | "subjects"
	>,
): SummaryRow[] {
	if (context.ranking.length > 0) {
		return context.ranking.slice(0, SUMMARY_RANKING).map((player) => ({
			key: player.playerId,
			name: player.label,
			value: round(player.mean),
			label: player.games === 1 ? "last game" : `${player.games} games`,
		}))
	}
	const matchup = context.matchup
	const rows = matchup
		? matchup.sides.map((side) => ({
				key: side.teamId,
				name: side.label,
				lead: matchupHeadline(side, matchup.focus),
			}))
		: context.subjects.map((subject) => ({
				key: subject.label,
				name: subject.label,
				lead: headline(subject),
			}))
	return rows.flatMap(({ key, name, lead }) =>
		lead ? [{ key, name, ...lead }] : [],
	)
}

export function matchupTiles(
	side: MatchupSide,
	focus: Matchup["focus"],
): Tile[] {
	const tiles: Tile[] = []
	const overall = side.overall
	if (!overall) return tiles

	// The same margin, narrowed to the side of the scoreboard this team is on
	// in this game. Not both splits for both teams - what the visitor does at
	// home says nothing about a road game.
	// A record here rather than another differential: the headline above is
	// already the scoring gap, and what the team has actually done in this role
	// is a different fact rather than the same one sliced again. Not a repeat of
	// the matchup header either, which carries the overall record only.
	const role = side.inThisRole
	if (role && role.games >= MIN_PER_SIDE) {
		tiles.push({
			// The NHL's overtime losses are written whenever ESPN's split supplies
			// them, zero included, the way hockey records always read.
			value: formatRecord(
				role.wins,
				role.losses,
				role.otLosses ?? (role.ties || null),
			),
			label: side.isHome ? "at home" : "on the road",
		})
	}

	// The summary the strip below no longer carries, now that it shows five.
	if (side.lastTen) {
		tiles.push({
			value: formatRecord(
				side.lastTen.wins,
				side.lastTen.losses,
				side.lastTen.otLosses ?? (side.lastTen.ties || null),
			),
			label: "last 10",
		})
	}

	if (
		focus === "SCORING" &&
		overall.overLine !== null &&
		overall.games >= MIN_HIT_RATE
	) {
		tiles.push({
			value: `${overall.overLine} of ${overall.games}`,
			label: "cleared the total",
		})
	}

	// Margin is the headline for a who-wins question, so it isn't repeated
	// here. What it's made of is what these two numbers add.
	if (overall.games >= MIN_RECORD) {
		tiles.push({
			value: `${round(overall.pointsForPerGame)} / ${round(overall.pointsAgainstPerGame)}`,
			label: "scored / allowed",
		})
	}

	const streak = side.streak
	if (streak && streak.length >= MIN_STREAK) {
		tiles.push({
			value: `${OUTCOME_LETTER[streak.outcome]}${streak.length}`,
			label: "current streak",
		})
	}

	if (side.restDays !== null) {
		tiles.push({
			value: String(side.restDays),
			label: pluralize(side.restDays, "day of rest", "days of rest"),
		})
	}

	return tiles
}

// Who won a given meeting is left to its two scores. A "SEA won" tag beside
// them is the kind of restatement every label on this card avoids.
//
// The series as a whole is a different matter: "HOU 2-9 SEA" sat in the same
// face and the same right-hand column as the scores below it and read as one
// more of them. Said in words it cannot - "leads" is what makes it a record
// rather than a scoreline.
export function seriesSummary(
	series: NonNullable<MatchupSide["headToHead"]>,
	first: MatchupSide,
	second: MatchupSide,
	teams: TeamLabels,
): string {
	const drawn = series.ties > 0 ? `-${series.ties}` : ""
	if (series.wins === series.losses) {
		return `series tied ${series.wins}-${series.losses}${drawn}`
	}
	const ahead = series.wins > series.losses ? first : second
	const high = Math.max(series.wins, series.losses)
	const low = Math.min(series.wins, series.losses)
	return `${teams[ahead.teamId] ?? ""} leads ${high}-${low}${drawn}`
}

export type TrackRecordSide =
	StatContextCard_TrackRecordFragment["rows"][number]["sides"][number]
