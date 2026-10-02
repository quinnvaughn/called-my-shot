import type { AwardVerb } from "@called-my-shot/schemas"

// One entry per recurring preseason question a league gets, generated (and
// re-generated idempotently) by lib/season-questions.ts. A discriminated
// union on `shape`, dispatched via ts-pattern in the engine, so a future
// template kind is a union member + a match arm there - not a new system.
// Templates sharing a ballotGroup land in one ballot together (e.g. every
// team's win-total question groups into one "Win Totals" ballot).
//
// The order groups first appear in a league's array below is the order their
// ballots display in (ballots.sortOrder), which is why each league's entries
// are written group-adjacent - moving a group's block moves its ballot. That
// only ever applies to a ballot that doesn't exist yet: an already-generated
// ballot keeps its position, so reordering here won't retroactively shuffle
// a season already underway, and a hand-reorder in the admin ballot list
// survives every later sync. See findOrCreateBallot in lib/season-questions.ts.
//
// player_award_finalists is deliberately not a template kind here: finalists
// aren't knowable at season start (they're announced mid/late-season), so
// that shape stays purely admin-authored through the ordinary createQuestion
// flow, never auto-generated.
export type RecurringQuestionTemplate =
	| {
			shape: "player_season_award"
			ballotGroup: string
			awardName: string
			awardVerb: AwardVerb
			picksRequired: number
			awardConferences?: string[]
			awardDivisions?: string[]
			awardPositions?: string[]
			awardSeasonsInLeague?: number[]
			awardRookieOnly?: boolean
			// Ballot member display (ballotQuestions.label/slot) - NOT the same
			// as awardName. label is the nav-critical full text ("First Base"),
			// slot is the short badge next to it ("1B"). Both fall back to
			// awardName/null when unset, which reads fine for an award with no
			// real position/short form (MVP, Cy Young) but wrong for anything
			// positional (a "Gold Glove, 1B" ballot member should say "First
			// Base" / "1B", not the whole award name).
			label?: string
			slot?: string
			// Heading for the run of consecutive members this one belongs to
			// (ballotQuestions.section) - "Offense"/"Defense"/"Special Teams" on
			// an All-Pro ballot. Members are attached in the order they appear
			// below, so a section's entries have to be written adjacent to each
			// other here to come out as one run. Left unset for a ballot short
			// enough to read without headings (every award ballot is, until it
			// gets to All-Pro's twenty slots).
			ballotSection?: string
	  }
	| {
			shape: "team_season_award"
			ballotGroup: string
			awardName: string
			awardVerb: AwardVerb
			picksRequired: number
			awardConferences?: string[]
			awardDivisions?: string[]
			// See the matching fields on player_season_award above.
			label?: string
			slot?: string
			ballotSection?: string
	  }
	| {
			shape: "team_season_stat_numeric_guess"
			ballotGroup: string
			// The catalog stat to look up (db/catalog/stats.ts), e.g. "Wins" -
			// generateQuestionTitle (packages/schemas/src/question-title.ts)
			// translates "Wins" to "win total" for the title itself, once, so
			// that phrasing doesn't need repeating per league here.
			statName: string
			// Documents that this template fans out to one question per team in
			// the league, not a single pool-based question like the two award
			// kinds above - the engine's dispatch on `shape` is what actually
			// branches the behavior, this is just a readability marker.
			perTeam: true
	  }

type MlbLeague = "AL" | "NL"
const MLB_LEAGUES: MlbLeague[] = ["AL", "NL"]

// One positional member of a multi-slot ballot (All-Pro, Gold Glove, Silver
// Slugger, All-MLB). `name` is the suffix the award name ends in and defaults
// to `slot`; picksRequired defaults to 1; awardPositions left unset means a
// whole-league pool.
type PositionSlot = {
	slot: string
	name?: string
	label: string
	picksRequired?: number
	awardPositions?: string[]
	ballotSection?: string
}

// Expands a slot list into one "be" award per slot, all in one ballot, each
// named `${awardPrefix}${name}` and optionally narrowed to one conference.
function positionBallot({
	ballotGroup,
	awardPrefix,
	conference,
	slots,
}: {
	ballotGroup: string
	awardPrefix: string
	conference?: string
	slots: PositionSlot[]
}): RecurringQuestionTemplate[] {
	return slots.map((s) => ({
		shape: "player_season_award",
		ballotGroup,
		...(s.ballotSection ? { ballotSection: s.ballotSection } : {}),
		awardName: `${awardPrefix}${s.name ?? s.slot}`,
		awardVerb: "be",
		picksRequired: s.picksRequired ?? 1,
		...(conference ? { awardConferences: [conference] } : {}),
		...(s.awardPositions ? { awardPositions: [...s.awardPositions] } : {}),
		label: s.label,
		slot: s.slot,
	}))
}

// A single-winner MLB award given once per league, as an AL/NL pair in one
// ballot. Each member's label is `${league} ${labelSuffix}`, or just the
// league when there's no suffix.
function perMlbLeague({
	ballotGroup,
	awardName,
	labelSuffix,
	awardPositions,
	awardRookieOnly,
}: {
	ballotGroup: string
	awardName: string
	labelSuffix?: string
	awardPositions?: string[]
	awardRookieOnly?: true
}): RecurringQuestionTemplate[] {
	return MLB_LEAGUES.map((league) => ({
		shape: "player_season_award",
		ballotGroup,
		awardName,
		awardVerb: "win",
		picksRequired: 1,
		awardConferences: [league],
		...(awardPositions ? { awardPositions: [...awardPositions] } : {}),
		...(awardRookieOnly ? { awardRookieOnly } : {}),
		label: labelSuffix ? `${league} ${labelSuffix}` : league,
		slot: league,
	}))
}

// The First and Second Team All-Pro ballots share this slot list. Three of
// the slots deliberately don't match the AP ballot one-for-one, because
// nothing in the synced data supports the distinction the AP draws - see the
// comments on those entries.
//
// Slot counts track the 2025 AP team and are NOT stable year to year (2024
// was 2 edge rushers and 3 linebackers; 2025 is 3 and 2, and an
// "All-Purpose" slot was added). picksRequired isn't part of the generator's
// idempotency key, so correcting a count here applies to the next season
// generated, never to questions already created.
const ALL_PRO_SLOTS: PositionSlot[] = [
	{
		ballotSection: "Offense",
		slot: "QB",
		label: "Quarterback",
		awardPositions: ["QB"],
	},
	{
		ballotSection: "Offense",
		slot: "RB",
		label: "Running Back",
		awardPositions: ["RB"],
	},
	{
		ballotSection: "Offense",
		slot: "FB",
		label: "Fullback",
		awardPositions: ["FB"],
	},
	{
		ballotSection: "Offense",
		slot: "AP",
		name: "All-Purpose",
		label: "All-Purpose",
		awardPositions: ["RB", "FB", "WR", "TE"],
	},
	{
		ballotSection: "Offense",
		slot: "WR",
		label: "Wide Receivers",
		picksRequired: 3,
		awardPositions: ["WR"],
	},
	{
		ballotSection: "Offense",
		slot: "TE",
		label: "Tight End",
		awardPositions: ["TE"],
	},
	// The AP names a left and a right tackle (and a left and a right guard)
	// separately. Nothing in players/teams records which side of the line a
	// lineman plays, so each pair is one two-pick question instead - which
	// side each winner played doesn't affect resolution.
	{
		ballotSection: "Offense",
		slot: "OT",
		label: "Tackles",
		picksRequired: 2,
		awardPositions: ["OT", "OL"],
	},
	{
		ballotSection: "Offense",
		slot: "G",
		label: "Guards",
		picksRequired: 2,
		awardPositions: ["G", "OL"],
	},
	{
		ballotSection: "Offense",
		slot: "C",
		label: "Center",
		awardPositions: ["C", "OL"],
	},
	// ESPN's DE/DT/LB tags don't line up with the AP's edge/interior split:
	// Watt, Hendrickson and Burns are tagged LB, Garrett and Parsons DE, and
	// Zach Allen - an interior selection - is DE too. Both pools are
	// therefore supersets wide enough to contain every real candidate. The
	// cost is that an off-ball linebacker can be picked for an edge slot;
	// the distinction lives in the question text and in resolution, not here.
	{
		ballotSection: "Defense",
		slot: "EDGE",
		label: "Edge Rushers",
		picksRequired: 3,
		awardPositions: ["DE", "LB"],
	},
	{
		ballotSection: "Defense",
		slot: "IDL",
		label: "Interior Linemen",
		picksRequired: 2,
		awardPositions: ["DT", "DE"],
	},
	{
		ballotSection: "Defense",
		slot: "LB",
		label: "Linebackers",
		picksRequired: 2,
		awardPositions: ["LB"],
	},
	// Three picks, not the AP's two outside corners plus a slot corner -
	// nothing distinguishes a slot corner in the synced data, so the three
	// are asked as one group.
	{
		ballotSection: "Defense",
		slot: "CB",
		label: "Cornerbacks",
		picksRequired: 3,
		awardPositions: ["CB"],
	},
	{
		ballotSection: "Defense",
		slot: "S",
		label: "Safeties",
		picksRequired: 2,
		awardPositions: ["S"],
	},
	{
		ballotSection: "Special Teams",
		slot: "K",
		label: "Kicker",
		awardPositions: ["PK"],
	},
	{
		ballotSection: "Special Teams",
		slot: "P",
		label: "Punter",
		awardPositions: ["P"],
	},
	{
		ballotSection: "Special Teams",
		slot: "LS",
		label: "Long Snapper",
		awardPositions: ["LS"],
	},
	// Returners and the special-teams slot carry no position tag of their own
	// - a returner is a receiver or back who also returns. Left unfiltered
	// (whole-league pool), same as the MLB Utility slots below.
	{ ballotSection: "Special Teams", slot: "KR", label: "Kick Returner" },
	{ ballotSection: "Special Teams", slot: "PR", label: "Punt Returner" },
	{ ballotSection: "Special Teams", slot: "ST", label: "Special Teamer" },
]

function allPro(team: "First" | "Second"): RecurringQuestionTemplate[] {
	return positionBallot({
		ballotGroup: `All-Pro ${team} Team`,
		awardPrefix: `All-Pro ${team} Team `,
		slots: ALL_PRO_SLOTS,
	})
}

// MLB positional slots, composed below into the Gold Glove, Silver Slugger
// and All-MLB ballots in each one's own display order.
const MLB_SLOT = {
	P: { slot: "P", label: "Pitcher", awardPositions: ["P", "RP", "SP"] },
	C: { slot: "C", label: "Catcher", awardPositions: ["C"] },
	"1B": { slot: "1B", label: "First Base", awardPositions: ["1B"] },
	"2B": { slot: "2B", label: "Second Base", awardPositions: ["2B"] },
	SS: { slot: "SS", label: "Shortstop", awardPositions: ["SS"] },
	"3B": { slot: "3B", label: "Third Base", awardPositions: ["3B"] },
	LF: { slot: "LF", label: "Left Field", awardPositions: ["LF"] },
	CF: { slot: "CF", label: "Center Field", awardPositions: ["CF"] },
	RF: { slot: "RF", label: "Right Field", awardPositions: ["RF"] },
	OF: {
		slot: "OF",
		label: "Outfield",
		picksRequired: 3,
		awardPositions: ["LF", "CF", "RF"],
	},
	DH: { slot: "DH", label: "Designated Hitter", awardPositions: ["DH"] },
	SP: {
		slot: "SP",
		label: "Starting Pitchers",
		picksRequired: 5,
		awardPositions: ["SP"],
	},
	RP: {
		slot: "RP",
		label: "Relief Pitchers",
		picksRequired: 2,
		awardPositions: ["RP"],
	},
	// No position tag for "plays several positions", so the pool is the
	// whole league (narrowed to the conference by the ballot).
	UT: { slot: "UT", name: "Utility", label: "Utility" },
} satisfies Record<string, PositionSlot>

function goldGloves(league: MlbLeague): RecurringQuestionTemplate[] {
	const { P, C, SS, LF, CF, RF, UT } = MLB_SLOT
	return positionBallot({
		ballotGroup: `${league} Gold Gloves`,
		awardPrefix: "Gold Glove, ",
		conference: league,
		slots: [
			P,
			C,
			MLB_SLOT["1B"],
			MLB_SLOT["2B"],
			SS,
			MLB_SLOT["3B"],
			LF,
			CF,
			RF,
			UT,
		],
	})
}

function silverSluggers(league: MlbLeague): RecurringQuestionTemplate[] {
	const { C, SS, OF, DH, UT } = MLB_SLOT
	return positionBallot({
		ballotGroup: `${league} Silver Sluggers`,
		awardPrefix: "Silver Slugger, ",
		conference: league,
		slots: [C, MLB_SLOT["1B"], MLB_SLOT["2B"], SS, MLB_SLOT["3B"], OF, DH, UT],
	})
}

function allMlb(team: "First" | "Second"): RecurringQuestionTemplate[] {
	const { C, SS, DH, OF, SP, RP } = MLB_SLOT
	return positionBallot({
		ballotGroup: `All MLB ${team} Team`,
		awardPrefix: `All MLB ${team} Team `,
		slots: [
			C,
			MLB_SLOT["1B"],
			MLB_SLOT["2B"],
			SS,
			MLB_SLOT["3B"],
			DH,
			OF,
			SP,
			RP,
		],
	})
}

// Keyed by league slug, same key SYNCED_LEAGUES (db/sync/leagues.ts) and
// LEAGUE_SEASON_FORMAT (db/catalog/league-season-format.ts) both use. Edited
// via PR, same as the stat catalog in db/catalog/stats.ts - not an
// admin-editable UI.
// The NHL's First or Second All-Star Team, one ballot each the way All-Pro is:
// a center, two wingers, two defensemen and a goalie.
function nhlAllStarTeam(team: "First" | "Second"): RecurringQuestionTemplate[] {
	return positionBallot({
		ballotGroup: `${team} All-Star Team`,
		awardPrefix: `${team} All-Star Team, `,
		slots: [
			{ slot: "C", name: "Center", label: "Center", awardPositions: ["C"] },
			{
				slot: "LW",
				name: "Left Wing",
				label: "Left Wing",
				awardPositions: ["LW"],
			},
			{
				slot: "RW",
				name: "Right Wing",
				label: "Right Wing",
				awardPositions: ["RW"],
			},
			{
				slot: "D",
				name: "Defense",
				label: "Defense",
				picksRequired: 2,
				awardPositions: ["D"],
			},
			{ slot: "G", name: "Goalie", label: "Goalie", awardPositions: ["G"] },
		],
	})
}

export const RECURRING_QUESTION_CATALOG: Record<
	string,
	RecurringQuestionTemplate[]
> = {
	nba: [
		{
			shape: "team_season_stat_numeric_guess",
			ballotGroup: "Win Totals",
			statName: "Wins",
			perTeam: true,
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "MVP",
			awardVerb: "win",
			picksRequired: 1,
			label: "MVP",
			slot: "MVP",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Defensive Player of the Year",
			awardVerb: "win",
			picksRequired: 1,
			label: "DPOY",
			slot: "DPOY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Rookie of the Year",
			awardVerb: "win",
			picksRequired: 1,
			awardRookieOnly: true,
			label: "ROTY",
			slot: "ROTY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Most Improved Player",
			awardVerb: "win",
			picksRequired: 1,
			label: "MIP",
			slot: "MIP",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Sixth Man of the Year",
			awardVerb: "win",
			picksRequired: 1,
			label: "Sixth Man",
			slot: "6th",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Clutch Player of the Year",
			awardVerb: "win",
			picksRequired: 1,
			label: "Clutch POY",
			slot: "CPOY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-NBA Teams",
			awardName: "All-NBA First Team",
			awardVerb: "be",
			picksRequired: 5,
			label: "All-NBA 1st",
			slot: "1st",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-NBA Teams",
			awardName: "All-NBA Second Team",
			awardVerb: "be",
			picksRequired: 5,
			label: "All-NBA 2nd",
			slot: "2nd",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-NBA Teams",
			awardName: "All-NBA Third Team",
			awardVerb: "be",
			picksRequired: 5,
			label: "All-NBA 3rd",
			slot: "3rd",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-Defensive Teams",
			awardName: "All-Defensive First Team",
			awardVerb: "be",
			picksRequired: 5,
			label: "All-Def 1st",
			slot: "D 1st",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-Defensive Teams",
			awardName: "All-Defensive Second Team",
			awardVerb: "be",
			picksRequired: 5,
			label: "All-Def 2nd",
			slot: "D 2nd",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-Rookie Teams",
			awardName: "All-Rookie First Team",
			awardVerb: "be",
			picksRequired: 5,
			awardRookieOnly: true,
			label: "All-Rookie 1st",
			slot: "R 1st",
		},
		{
			shape: "player_season_award",
			ballotGroup: "All-Rookie Teams",
			awardName: "All-Rookie Second Team",
			awardVerb: "be",
			picksRequired: 5,
			awardRookieOnly: true,
			label: "All-Rookie 2nd",
			slot: "R 2nd",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "NBA Finals",
			awardVerb: "win",
			picksRequired: 1,
			label: "NBA Finals",
			slot: "Finals",
		},
		// awardConferences does double duty on the two below: it narrows the
		// pool to that conference's 15 teams (buildTeamPool), and it supplies
		// the title's qualifier - "East" reads back as "Eastern" through
		// CONFERENCE_TITLE_NAMES in packages/schemas/src/question-title.ts.
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Conference Finals",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["East"],
			label: "Eastern Conference",
			slot: "East",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Conference Finals",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["West"],
			label: "Western Conference",
			slot: "West",
		},
	],
	nfl: [
		{
			shape: "team_season_stat_numeric_guess",
			ballotGroup: "Win Totals",
			statName: "Wins",
			perTeam: true,
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "MVP",
			awardVerb: "win",
			picksRequired: 1,
			label: "MVP",
			slot: "MVP",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Offensive Player of the Year",
			awardVerb: "win",
			picksRequired: 1,
			label: "OPOY",
			slot: "OPOY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Defensive Player of the Year",
			awardVerb: "win",
			picksRequired: 1,
			label: "DPOY",
			slot: "DPOY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Offensive Rookie of the Year",
			awardVerb: "win",
			picksRequired: 1,
			awardRookieOnly: true,
			label: "OROY",
			slot: "OROY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Defensive Rookie of the Year",
			awardVerb: "win",
			picksRequired: 1,
			awardRookieOnly: true,
			label: "DROY",
			slot: "DROY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Comeback Player of the Year",
			awardVerb: "win",
			picksRequired: 1,
			label: "Comeback POY",
			slot: "CPOY",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Protector of the Year",
			awardVerb: "win",
			picksRequired: 1,
			awardPositions: ["OT", "G", "C", "OL"],
			label: "Protector",
			slot: "POTY",
		},
		...allPro("First"),
		...allPro("Second"),
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Super Bowl",
			awardVerb: "win",
			picksRequired: 1,
			label: "Super Bowl",
			slot: "SB",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Championship",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["AFC"],
			label: "AFC Championship",
			slot: "AFC",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Championship",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["NFC"],
			label: "NFC Championship",
			slot: "NFC",
		},
	],
	mlb: [
		{
			shape: "team_season_stat_numeric_guess",
			ballotGroup: "Win Totals",
			statName: "Wins",
			perTeam: true,
		},
		...perMlbLeague({
			ballotGroup: "MVPs",
			awardName: "MVP",
			labelSuffix: "MVP",
		}),
		...perMlbLeague({
			ballotGroup: "Cy Youngs",
			awardName: "Cy Young",
			labelSuffix: "Cy Young",
			awardPositions: ["P", "RP", "SP"],
		}),
		...perMlbLeague({
			ballotGroup: "Hank Aaron Awards",
			awardName: "Hank Aaron Award",
			labelSuffix: "Hank Aaron",
		}),
		...perMlbLeague({
			ballotGroup: "Platinum Gloves",
			awardName: "Platinum Glove",
		}),
		...perMlbLeague({
			ballotGroup: "Rookies of the Year",
			awardName: "Rookie of the Year",
			labelSuffix: "ROTY",
			awardRookieOnly: true,
		}),
		...perMlbLeague({
			ballotGroup: "Relievers of the Year",
			awardName: "Reliever of the Year",
			labelSuffix: "Reliever",
			awardPositions: ["RP"],
		}),
		...goldGloves("AL"),
		...goldGloves("NL"),
		...silverSluggers("AL"),
		...silverSluggers("NL"),
		...allMlb("First"),
		...allMlb("Second"),
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "World Series",
			awardVerb: "win",
			picksRequired: 1,
			label: "World Series",
			slot: "WS",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Pennant",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["AL"],
			label: "AL Pennant",
			slot: "AL",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Pennant",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["NL"],
			label: "NL Pennant",
			slot: "NL",
		},
	],
	nhl: [
		{
			shape: "team_season_stat_numeric_guess",
			ballotGroup: "Win Totals",
			statName: "Wins",
			perTeam: true,
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Hart Trophy",
			awardVerb: "win",
			picksRequired: 1,
			label: "Hart (MVP)",
			slot: "Hart",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Vezina Trophy",
			awardVerb: "win",
			picksRequired: 1,
			awardPositions: ["G"],
			label: "Vezina (Goalie)",
			slot: "Vezina",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Norris Trophy",
			awardVerb: "win",
			picksRequired: 1,
			awardPositions: ["D"],
			label: "Norris (Defenseman)",
			slot: "Norris",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Calder Trophy",
			awardVerb: "win",
			picksRequired: 1,
			awardRookieOnly: true,
			label: "Calder (Rookie)",
			slot: "Calder",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Selke Trophy",
			awardVerb: "win",
			picksRequired: 1,
			awardPositions: ["C", "LW", "RW"],
			label: "Selke (Defensive Forward)",
			slot: "Selke",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Art Ross Trophy",
			awardVerb: "win",
			picksRequired: 1,
			label: "Art Ross (Points)",
			slot: "Ross",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Rocket Richard Trophy",
			awardVerb: "win",
			picksRequired: 1,
			label: "Rocket Richard (Goals)",
			slot: "Richard",
		},
		{
			shape: "player_season_award",
			ballotGroup: "Major Awards",
			awardName: "Conn Smythe Trophy",
			awardVerb: "win",
			picksRequired: 1,
			label: "Conn Smythe (Playoff MVP)",
			slot: "Smythe",
		},
		...nhlAllStarTeam("First"),
		...nhlAllStarTeam("Second"),
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Stanley Cup",
			awardVerb: "win",
			picksRequired: 1,
			label: "Stanley Cup",
			slot: "Cup",
		},
		// See the NBA's conference entries for what awardConferences does here.
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Conference Final",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["East"],
			label: "Eastern Conference",
			slot: "East",
		},
		{
			shape: "team_season_award",
			ballotGroup: "Postseason",
			awardName: "Conference Final",
			awardVerb: "win",
			picksRequired: 1,
			awardConferences: ["West"],
			label: "Western Conference",
			slot: "West",
		},
	],
}
