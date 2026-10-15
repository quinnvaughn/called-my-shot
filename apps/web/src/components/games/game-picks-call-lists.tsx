import { EntryCallList } from "#/components/ballots/entry-call-list"
import type { GameEntryQuery } from "#/graphql/generated/graphql"
import type { GameEntryRow } from "#/lib/game-entry"

type Entry = NonNullable<NonNullable<GameEntryQuery["game"]>["entry"]>
type Member = Entry["members"][number]

export function GamePicksCallLists({
	entry,
	called,
	notCalledYet,
	missed,
}: {
	entry: Entry
	called: GameEntryRow<Member["question"], NonNullable<Member["call"]>>[]
	notCalledYet: string[]
	missed: string[]
}) {
	return (
		<>
			<EntryCallList
				rows={called.flatMap((row) =>
					row.call
						? [{ key: row.question.id, section: row.section, call: row.call }]
						: [],
				)}
				fallbackLabel="Official questions"
				notCalledYet={notCalledYet}
				missed={missed}
			/>
			{/* After the official slate and what's left of it: community
			questions are extra, called on top of the questions everyone got. */}
			{entry.communityMembers.length > 0 && (
				<EntryCallList
					rows={entry.communityMembers.flatMap((m) =>
						m.call ? [{ key: m.question.id, section: null, call: m.call }] : [],
					)}
					fallbackLabel="Community questions"
					notCalledYet={[]}
					missed={[]}
				/>
			)}
		</>
	)
}
