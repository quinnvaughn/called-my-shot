import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotUncalledLine } from "#/components/ballots/ballot-uncalled-line"
import {
	CallCard,
	type CallCardFragment,
} from "#/components/questions/call-card"
import { Card } from "#/components/ui/card"
import type { FragmentType } from "#/graphql/generated"

type Row = {
	key: string
	// A ballot member's section, a game question's ("Team lines"). Null on a
	// ballot with no sections.
	section: string | null
	call: FragmentType<typeof CallCardFragment>
}

type Props = {
	// Called questions only, already in the set's order.
	rows: Row[]
	// The label over a run of rows with no section of their own.
	fallbackLabel: string
	// What's left uncalled, split by whether it can still be called.
	notCalledYet: string[]
	missed: string[]
}

const labelClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
})

// An entry page's picks: each one as the CallCard it is everywhere else,
// grouped under its section's label, then what wasn't called summed up
// underneath so a set shared early isn't a long run of empty rows.
export function EntryCallList({
	rows,
	fallbackLabel,
	notCalledYet,
	missed,
}: Props) {
	// Runs of consecutive rows sharing a section, so the order stays the
	// set's own even if a section were to come round twice.
	const groups = rows.reduce<{ label: string; rows: Row[] }[]>((acc, row) => {
		const label = row.section ?? fallbackLabel
		const last = acc.at(-1)
		if (last && last.label === label) last.rows.push(row)
		else acc.push({ label, rows: [row] })
		return acc
	}, [])

	return (
		<VStack gap="6" alignItems="stretch">
			{groups.map((group, i) => (
				<VStack
					// biome-ignore lint/suspicious/noArrayIndexKey: a label can repeat across runs, the position can't
					key={`${group.label}-${i}`}
					gap="3"
					alignItems="stretch"
				>
					<span className={labelClass}>{group.label}</span>
					<VStack gap="2" alignItems="stretch">
						{group.rows.map((row) => (
							<CallCard key={row.key} call={row.call} />
						))}
					</VStack>
				</VStack>
			))}
			{(notCalledYet.length > 0 || missed.length > 0) && (
				<Card>
					<VStack gap="0" alignItems="stretch">
						{notCalledYet.length > 0 && (
							<BallotUncalledLine
								heading="Not called yet"
								labels={notCalledYet}
							/>
						)}
						{missed.length > 0 && (
							<BallotUncalledLine heading="Missed" labels={missed} />
						)}
					</VStack>
				</Card>
			)}
		</VStack>
	)
}
