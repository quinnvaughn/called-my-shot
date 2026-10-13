import { useRouteContext } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import type { ChallengeState } from "#/graphql/generated/graphql"
import { useNow } from "#/hooks/use-now"
import { type ChallengeRecord, recordLine } from "#/lib/challenge"
import { pluralize } from "#/lib/pluralize"

type Props = {
	state: ChallengeState
	closesAt: string | null
	acceptanceCount: number
	creator: { id: string; username: string }
	tally: ChallengeRecord
}

// Where a challenge stands as a short label and value: when it closes while
// it's open, its state after.
export function useStatusFact(
	state: ChallengeState,
	closesAt: string | null,
): { label: string; value: string } {
	const now = useNow(state === "OPEN" ? 60_000 : null)
	return {
		label: state === "OPEN" ? "Closes" : "Status",
		value: match(state)
			.with("OPEN", () =>
				closesAt
					? (DateTime.fromISO(closesAt).toRelative({
							base: DateTime.fromMillis(now),
						}) ?? "Soon")
					: "Open",
			)
			.with("LIVE", () => "Playing")
			.with("SETTLED", () => "Final")
			.with("VOIDED", () => "Voided")
			.exhaustive(),
	}
}

// Where a challenge stands, in one line.
export function ChallengeStatus({
	state,
	closesAt,
	acceptanceCount,
	creator,
	tally,
}: Props) {
	const { me } = useRouteContext({ from: "__root__" })
	const who = me?.id === creator.id ? "You" : `@${creator.username}`
	const now = useNow(state === "OPEN" ? 60_000 : null)
	const taken = `${acceptanceCount} ${pluralize(acceptanceCount, "person", "people")} took it on`

	return (
		<>
			{match(state)
				.with("OPEN", () =>
					closesAt
						? `Closes ${DateTime.fromISO(closesAt).toRelative({ base: DateTime.fromMillis(now) })}, when its first question locks · ${taken}`
						: taken,
				)
				.with("LIVE", () => `Closed · ${taken} · waiting on results`)
				.with("SETTLED", () =>
					acceptanceCount > 0
						? `Final · ${who} went ${recordLine(tally)}`
						: "Final · nobody took it on",
				)
				.with("VOIDED", () => "Every question in it was voided")
				.exhaustive()}
		</>
	)
}
