import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import type { BallotMemberState } from "./ballot-member-state"

// Which of a game's official questions the viewer is sent to after making a
// call, in the game page's order (see officialQuestionSequence), and whether
// it follows from the side they took on who wins.
//
// Who wins comes first while it's uncalled: everything else on the game is
// easier to call once that's settled. After that, a question about the team
// the viewer picked to win goes ahead of the rest, because extending a view
// they already hold is easier than forming a new one.

// What a question says about the game's two teams, as the ranking reads it.
export type NextUpEntry = {
	shape: QuestionShape
	// The one team the question is about: a team's line, or a player's.
	soleTeamId: string | null
	// The teams on either side of a head to head.
	sideTeamIds: string[]
}

type TeamRef = { id: string } | null | undefined

export type NextUpQuestion = {
	shape: QuestionShape
	subjectTeam?: TeamRef
	subjectPlayer?: { currentTeam?: TeamRef } | null
	options: { player?: { currentTeam?: TeamRef } | null }[]
}

// A player's current team only counts when it's one of the game's two: after
// a trade it can be neither, and a guess is worse than no ranking.
export function nextUpEntry(
	question: NextUpQuestion,
	gameTeamIds: string[],
): NextUpEntry {
	const inGame = (team: TeamRef) =>
		team && gameTeamIds.includes(team.id) ? team.id : null
	const none = { shape: question.shape, soleTeamId: null, sideTeamIds: [] }
	return (
		match(question.shape)
			.returnType<NextUpEntry>()
			.with("TEAM_STAT_OVER_UNDER", "TEAM_STAT_NUMERIC_GUESS", () => ({
				...none,
				soleTeamId: inGame(question.subjectTeam),
			}))
			.with("PLAYER_STAT_OVER_UNDER", "PLAYER_STAT_NUMERIC_GUESS", () => ({
				...none,
				soleTeamId: inGame(question.subjectPlayer?.currentTeam),
			}))
			.with("PLAYER_VS_PLAYER", () => ({
				...none,
				sideTeamIds: question.options.flatMap((option) => {
					const team = inGame(option.player?.currentTeam)
					return team ? [team] : []
				}),
			}))
			// About the whole game, a pool across both rosters, or nothing on the
			// game at all.
			.with(
				"TEAM_VS_TEAM",
				"GAME_TOTAL_OVER_UNDER",
				"PLAYER_GAME_STAT_LEADER",
				"YES_NO_PROP",
				"PLAYER_AWARD_FINALISTS",
				"PLAYER_SEASON_AWARD",
				"PLAYER_SEASON_STAT_LEADER",
				"PLAYER_SEASON_STAT_OVER_UNDER",
				"PLAYER_TEAM_SEASON_STAT_LEADER",
				"PLAYER_VS_PLAYER_SEASON",
				"TEAM_SEASON_AWARD",
				"TEAM_SEASON_STAT_NUMERIC_GUESS",
				"TEAM_SEASON_STAT_OVER_UNDER",
				"TEAM_VS_TEAM_SEASON",
				() => none,
			)
			.exhaustive()
	)
}

export type NextUpPick = {
	index: number
	// The question is about the team the viewer picked to win, so the step
	// can say so.
	aboutPickedTeam: boolean
}

const tierOf = (entry: NextUpEntry, pickedTeamId: string | null) =>
	!pickedTeamId
		? 0
		: entry.soleTeamId === pickedTeamId
			? 2
			: entry.sideTeamIds.includes(pickedTeamId)
				? 1
				: 0

// Null once nothing but the current question is left to call.
export function pickNextUp(
	entries: NextUpEntry[],
	states: BallotMemberState[],
	currentIndex: number,
	pickedTeamId: string | null,
): NextUpPick | null {
	const uncalled = (i: number) => states[i] === "uncalled" && i !== currentIndex

	const winnerIndex = entries.findIndex((e) => e.shape === "TEAM_VS_TEAM")
	if (winnerIndex !== -1 && uncalled(winnerIndex)) {
		return { index: winnerIndex, aboutPickedTeam: false }
	}

	// The game page's order, starting after the current question and wrapping.
	const open = entries.map((_, i) => i).filter(uncalled)
	const ordered = [
		...open.filter((i) => i > currentIndex),
		...open.filter((i) => i < currentIndex),
	]

	let best: { index: number; tier: number } | null = null
	for (const index of ordered) {
		const entry = entries[index]
		if (!entry) continue
		const tier = tierOf(entry, pickedTeamId)
		if (!best || tier > best.tier) best = { index, tier }
	}
	return best ? { index: best.index, aboutPickedTeam: best.tier === 2 } : null
}
