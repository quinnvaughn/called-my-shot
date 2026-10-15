import { type ReactNode, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { ChipButton } from "#/components/ui/chip-button"
import {
	RebalanceWinTotalsDocument,
	SetBallotTiebreakOrderDocument,
} from "#/graphql/ballots/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { pluralize } from "#/lib/pluralize"
import {
	projectStandings,
	type StandingsRow,
	type StandingsSection,
	type StandingsTeamInput,
	tiebreakOrderAfterMove,
} from "#/lib/projected-standings"
import { leagueWins } from "#/lib/win-total-tracker"
import { showToast } from "#/stores/toast-store"
import { RebalancePanel } from "./rebalance-panel"
import { SectionRows } from "./section-rows"
import type { Adjust, MoveHandlers } from "./types"

type Props = {
	leagueSlug: string
	leagueAbbreviation: string
	gamesPerSeason: number
	teams: StandingsTeamInput[]
	// Questions whose tie order the viewer can still change: their own picks,
	// still open. Empty for anyone else's ballot.
	reorderableQuestionIds: Set<string>
	// Whose picks these are, for the summary line ("Your picks", "@sam's picks").
	ownerLabel: string
	// Set where ties are ordered in place (the ballot page). Null on a page
	// that only shows standings, which gets `orderElsewhere` instead.
	editing: { ballotId: string; onSaved: () => Promise<unknown> } | null
	// Shown in place of the arrows when the viewer has a tie they could order
	// somewhere else.
	orderElsewhere?: ReactNode
	// Shown under an off total when the viewer could rebalance it somewhere
	// else.
	rebalanceElsewhere?: ReactNode
}

// A win-totals ballot read as the standings it implies, in the league's own
// playoff format. Teams on the same total can trade places right in the
// table; the new order shows at once and saves behind the scenes.
export function ProjectedStandings({
	leagueSlug,
	leagueAbbreviation,
	gamesPerSeason,
	teams,
	reorderableQuestionIds,
	ownerLabel,
	editing,
	orderElsewhere,
	rebalanceElsewhere,
}: Props) {
	// Tie orders set here and not yet reflected in `teams`.
	const [pending, setPending] = useState<Map<string, number>>(new Map())
	const setOrder = useGqlMutation(SetBallotTiebreakOrderDocument)
	const rebalanceMutation = useGqlMutation(RebalanceWinTotalsDocument)
	const [conferenceKey, setConferenceKey] = useState<string | null>(null)
	// The numbers a rebalance in progress has moved picks to, keyed by
	// questionId. Null when not rebalancing.
	const [draft, setDraft] = useState<Map<string, number> | null>(null)

	// Measured on the saved picks, not the draft: how far off the ballot is
	// is what a rebalance is allowed to make up.
	const target = leagueWins(gamesPerSeason, teams.length)
	const savedTotal = teams.reduce((sum, t) => sum + (t.wins ?? 0), 0)
	const off = savedTotal - target
	const allPicked = teams.every((t) => t.wins !== null)
	const canRebalance =
		editing !== null &&
		allPicked &&
		off !== 0 &&
		teams.every((t) => reorderableQuestionIds.has(t.questionId))

	const current = teams.map((team) => ({
		...team,
		wins: draft?.get(team.questionId) ?? team.wins,
		tiebreakPosition: pending.get(team.questionId) ?? team.tiebreakPosition,
	}))
	const moved = teams.reduce(
		(sum, t) =>
			sum + Math.abs((draft?.get(t.questionId) ?? t.wins ?? 0) - (t.wins ?? 0)),
		0,
	)
	const budgetLeft = Math.abs(off) - moved
	const standings = projectStandings({
		leagueSlug,
		gamesPerSeason,
		teams: current,
	})
	if (!standings) return null
	const shown =
		standings.conferences.find((c) => c.conference === conferenceKey) ??
		standings.conferences[0]

	async function move(
		{ ballotId, onSaved }: NonNullable<Props["editing"]>,
		movingId: string,
		targetId: string,
	) {
		const order = tiebreakOrderAfterMove(current, movingId, targetId)
		const previous = pending
		setPending((existing) => {
			const next = new Map(existing)
			for (const [position, id] of order.entries()) next.set(id, position)
			return next
		})
		try {
			const { setBallotTiebreakOrder: result } = await setOrder.mutateAsync({
				ballotId,
				questionIds: order,
			})
			if (result.__typename !== "MutationSetBallotTiebreakOrderSuccess") {
				throw new Error(result.message ?? "Couldn't save that order.")
			}
			onSaved()
		} catch (caught) {
			setPending(previous)
			showToast({
				message:
					caught instanceof Error
						? caught.message
						: "Couldn't save that order.",
			})
		}
	}

	// Both rows have to be the viewer's own open picks for them to trade places.
	const neighbours = (section: StandingsSection, i: number) => {
		const row = section.rows[i]
		const above = section.rows[i - 1]
		const below = section.rows[i + 1]
		const mine = (r: StandingsRow | undefined) =>
			r !== undefined && reorderableQuestionIds.has(r.team.questionId)
		return {
			above: row.canMoveUp && mine(row) && mine(above) ? above : null,
			below: row.canMoveDown && mine(row) && mine(below) ? below : null,
		}
	}
	const movesFor = (section: StandingsSection, i: number): MoveHandlers => {
		if (draft) return { up: null, down: null }
		const { above, below } = neighbours(section, i)
		const id = section.rows[i].team.questionId
		return {
			up:
				editing && above
					? () => move(editing, id, above.team.questionId)
					: null,
			down:
				editing && below
					? () => move(editing, id, below.team.questionId)
					: null,
		}
	}
	const hasTies = shown?.sections.some((section) =>
		section.rows.some((_, i) => {
			const { above, below } = neighbours(section, i)
			return above !== null || below !== null
		}),
	)

	const adjustFor = (row: StandingsRow): Adjust | null => {
		if (!draft || row.wins === null) return null
		const original = teams.find(
			(t) => t.questionId === row.team.questionId,
		)?.wins
		if (original == null) return null
		const value = row.wins
		const set = (next: number) =>
			setDraft((existing) => {
				const updated = new Map(existing ?? [])
				if (next === original) updated.delete(row.team.questionId)
				else updated.set(row.team.questionId, next)
				return updated
			})
		// Over the schedule: picks only come down, and back up as far as
		// where they started. Under it, the mirror image.
		return off > 0
			? {
					original,
					down: budgetLeft > 0 && value > 0 ? () => set(value - 1) : null,
					up: value < original ? () => set(value + 1) : null,
				}
			: {
					original,
					down: value > original ? () => set(value - 1) : null,
					up:
						budgetLeft > 0 && value < gamesPerSeason
							? () => set(value + 1)
							: null,
				}
	}

	async function saveRebalance() {
		if (!editing || !draft) return
		const changes = [...draft.entries()].map(([questionId, guessValue]) => ({
			questionId,
			guessValue,
		}))
		if (changes.length === 0) {
			setDraft(null)
			return
		}
		try {
			const { rebalanceWinTotals: result } =
				await rebalanceMutation.mutateAsync({
					ballotId: editing.ballotId,
					changes,
				})
			if (result.__typename !== "MutationRebalanceWinTotalsSuccess") {
				throw new Error(result.message ?? "Couldn't save the rebalance.")
			}
			await editing.onSaved()
			setDraft(null)
		} catch (caught) {
			showToast({
				message:
					caught instanceof Error
						? caught.message
						: "Couldn't save the rebalance.",
			})
		}
	}

	return (
		<VStack gap="6" alignItems="stretch">
			{draft ? (
				<RebalancePanel
					off={off}
					moved={moved}
					target={target}
					saving={rebalanceMutation.isPending}
					onCancel={() => setDraft(null)}
					onSave={saveRebalance}
				/>
			) : (
				<VStack gap="2" alignItems="flex-start">
					<VStack gap="1" alignItems="flex-start">
						<span className={css({ fontSize: "sm", color: "fg.muted" })}>
							{allPicked
								? `${ownerLabel} add up to ${savedTotal} wins. A full ${leagueAbbreviation} season has exactly ${target}, one per game.`
								: `${standings.pickedCount} of ${standings.teamCount} teams picked. Unpicked teams sit at the bottom of their group.`}
						</span>
						{allPicked && off !== 0 && (
							<span
								className={css({ fontSize: "sm", color: "warning.default" })}
							>
								{off > 0
									? `That's ${off} more ${pluralize(off, "win")} than the schedule allows.`
									: `That's ${-off} ${pluralize(-off, "win")} short of what the schedule hands out.`}
							</span>
						)}
					</VStack>
					{canRebalance ? (
						<Button
							variant="dark"
							size="sm"
							onClick={() => setDraft(new Map())}
						>
							Rebalance
						</Button>
					) : (
						allPicked && off !== 0 && rebalanceElsewhere
					)}
				</VStack>
			)}

			{standings.conferences.length > 1 && (
				<HStack gap="2" flexWrap="wrap">
					{standings.conferences.map((conference) => {
						const selected = conference.conference === shown?.conference
						return (
							<ChipButton
								key={conference.conference}
								selected={selected}
								pressed={selected}
								onClick={() => setConferenceKey(conference.conference)}
							>
								{conference.label}
							</ChipButton>
						)
					})}
				</HStack>
			)}

			{shown && (
				<VStack gap="3" alignItems="stretch">
					{shown.seedsNote && (
						<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
							{shown.seedsNote}
						</span>
					)}
					{hasTies &&
						!draft &&
						(editing ? (
							<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
								Teams on the same win total go alphabetically until you change
								it. Use the arrows to set who finishes ahead.
							</span>
						) : (
							orderElsewhere
						))}
					<Card>
						<VStack gap="0" alignItems="stretch">
							{shown.sections.map((section) => (
								<SectionRows
									key={section.key}
									section={section}
									showLosses={standings.showLosses}
									movesFor={movesFor}
									adjustFor={adjustFor}
								/>
							))}
						</VStack>
					</Card>
				</VStack>
			)}
		</VStack>
	)
}
