import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Select } from "#/components/ui/select"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidateTeammateChain,
	RerollTeammateChainPuzzleDocument,
	SwapTeammateChainPuzzlesDocument,
} from "#/graphql/teammate-chain/mutations"

type Result =
	| { __typename: "ValidationError"; fieldErrors: { message: string }[] }
	| { __typename: string }

const ANY = ""

// The overrides for a day after today (today's is already being played): a
// new random pair, from a league if picked, or trading with another day.
export function AdminChainDayEditor({
	date,
	leagueId: currentLeagueId,
	scheduled,
	leagues,
	otherDates,
}: {
	date: string
	leagueId: string | null
	scheduled: boolean
	leagues: { id: string; abbreviation: string }[]
	otherDates: { date: string; label: string }[]
}) {
	const queryClient = useQueryClient()
	const reroll = useGqlMutation(RerollTeammateChainPuzzleDocument)
	const swap = useGqlMutation(SwapTeammateChainPuzzlesDocument)
	const [leagueId, setLeagueId] = useState(
		currentLeagueId ?? leagues[0]?.id ?? ANY,
	)
	const [swapDate, setSwapDate] = useState(ANY)
	const [error, setError] = useState<string | null>(null)
	const pending = reroll.isPending || swap.isPending

	async function run(result: Promise<Result>) {
		setError(null)
		const data = await result
		if ("fieldErrors" in data) {
			setError(data.fieldErrors[0]?.message ?? "That didn't work.")
			return
		}
		await invalidateTeammateChain(queryClient)
	}

	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "4",
				padding: "4",
				bg: "bg.subtle",
			})}
		>
			<FormError message={error} />
			<HStack gap="2" flexWrap="wrap">
				<Select value={leagueId} onValueChange={setLeagueId}>
					<Select.Trigger>
						{leagues.find((l) => l.id === leagueId)?.abbreviation ?? "League"}
					</Select.Trigger>
					<Select.Content>
						{leagues.map((l) => (
							<Select.Option key={l.id} value={l.id}>
								{l.abbreviation}
							</Select.Option>
						))}
					</Select.Content>
				</Select>
				<Button
					variant="outline"
					disabled={pending || leagueId === ANY}
					onClick={() =>
						void run(
							reroll
								.mutateAsync({ date, leagueId })
								.then((d) => d.rerollTeammateChainPuzzle),
						)
					}
				>
					New pair
				</Button>
			</HStack>

			{scheduled && otherDates.length > 0 && (
				<HStack gap="2" flexWrap="wrap">
					<Select value={swapDate} onValueChange={setSwapDate}>
						<Select.Trigger>
							{otherDates.find((d) => d.date === swapDate)?.label ??
								"Another day"}
						</Select.Trigger>
						<Select.Content>
							{otherDates.map((d) => (
								<Select.Option key={d.date} value={d.date}>
									{d.label}
								</Select.Option>
							))}
						</Select.Content>
					</Select>
					<Button
						variant="outline"
						disabled={pending || swapDate === ANY}
						onClick={() =>
							void run(
								swap
									.mutateAsync({ date, otherDate: swapDate })
									.then((d) => d.swapTeammateChainPuzzles),
							)
						}
					>
						Swap days
					</Button>
				</HStack>
			)}
		</div>
	)
}
