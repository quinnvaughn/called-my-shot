import { Link } from "@tanstack/react-router"
import { arrowLink } from "#/components/ui/arrow-link"
import type { CallRecord, CallView } from "#/lib/call-view"
import { matchupLabel } from "#/lib/game-status"
import { streakFamilyParam } from "#/lib/streak-meta"

type Props = {
	call: CallRecord
	view: CallView
}

export function CallPageLinks({ call, view }: Props) {
	return (
		<>
			{/* The rest of their calls on this game, and their presser on it
			once the game is final. Official questions only, since those are
			the ones the picks page lists. */}
			{call.question.game && call.question.isOfficial && (
				<Link
					to="/games/$gameId/picks/$username"
					params={{
						gameId: call.question.game.id,
						username: call.user.username,
					}}
					className={arrowLink({ tone: "quiet" })}
				>
					All of @{call.user.username}'s {matchupLabel(call.question.game)}{" "}
					picks →
				</Link>
			)}

			{/* The same for a ballot question: the rest of their entry on it. */}
			{call.question.ballotMembership && (
				<Link
					to="/ballots/$ballotSlug/$username"
					params={{
						ballotSlug: call.question.ballotMembership.ballot.slug,
						username: call.user.username,
					}}
					className={arrowLink({ tone: "quiet" })}
				>
					All of @{call.user.username}'s{" "}
					{call.question.ballotMembership.ballot.name} picks →
				</Link>
			)}

			{call.streak && (
				<Link
					to="/user/$username/streaks/$league/$family/$mode"
					params={{
						username: call.user.username,
						league: call.question.league.slug,
						family: streakFamilyParam(call.streak.family),
						// A call carries a streak tag only when it extended a run.
						mode: "hot",
					}}
					className={arrowLink({ tone: "quiet" })}
				>
					Part of a {call.streak.length}-call {view.leagueAbbr}{" "}
					{call.streak.familyLabel} streak →
				</Link>
			)}
		</>
	)
}
