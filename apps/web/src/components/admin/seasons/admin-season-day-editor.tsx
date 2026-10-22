import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Select } from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import { useGqlMutation } from "#/graphql/hooks"
import {
	EditSeasonPuzzleCluesDocument,
	invalidateSeasonPuzzles,
	RerollSeasonPuzzleDocument,
	SetSeasonPuzzleDocument,
	SwapSeasonPuzzlesDocument,
} from "#/graphql/season-puzzles/mutations"
import { seasonGuessOptionsQuery } from "#/graphql/season-puzzles/queries"

type Result =
	| { __typename: "ValidationError"; fieldErrors: { message: string }[] }
	| { __typename: string }

const NONE = ""

// The overrides for one day. Every day: rewrite a clue. A day after today:
// a random season instead, a season picked by hand, or trading with another
// day. Today's is already being played, so only its clues can change.
export function AdminSeasonDayEditor({
	date,
	isToday,
	puzzle,
	leagues,
	otherDates,
}: {
	date: string
	isToday: boolean
	puzzle: { clues: string[]; leagueId: string } | null
	leagues: { id: string; abbreviation: string }[]
	// Days after today with a puzzle, to swap with.
	otherDates: { date: string; label: string }[]
}) {
	const queryClient = useQueryClient()
	const edit = useGqlMutation(EditSeasonPuzzleCluesDocument)
	const reroll = useGqlMutation(RerollSeasonPuzzleDocument)
	const set = useGqlMutation(SetSeasonPuzzleDocument)
	const swap = useGqlMutation(SwapSeasonPuzzlesDocument)
	const [clues, setClues] = useState(puzzle?.clues ?? [])
	const [leagueId, setLeagueId] = useState(
		puzzle?.leagueId ?? leagues[0]?.id ?? NONE,
	)
	const [teamId, setTeamId] = useState(NONE)
	const [year, setYear] = useState(NONE)
	const [swapDate, setSwapDate] = useState(NONE)
	const [error, setError] = useState<string | null>(null)

	const { data: options } = useQuery({
		...seasonGuessOptionsQuery(leagueId),
		enabled: !isToday && leagueId !== NONE,
	})
	const franchises = options?.seasonGuessOptions ?? []
	const franchise = franchises.find((f) => f.team.id === teamId) ?? null
	const pending =
		edit.isPending || reroll.isPending || set.isPending || swap.isPending

	async function run(result: Promise<Result>) {
		setError(null)
		const data = await result
		if ("fieldErrors" in data) {
			setError(data.fieldErrors[0]?.message ?? "That didn't work.")
			return
		}
		await invalidateSeasonPuzzles(queryClient)
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
			{puzzle && (
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "2",
					})}
				>
					{clues.map((clue, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: clues are positional and never reorder
						<Textarea key={i}>
							<Textarea.Label>Clue {i + 1}</Textarea.Label>
							<Textarea.Field
								rows={2}
								value={clue}
								onChange={(event) =>
									setClues(
										clues.map((c, j) => (j === i ? event.target.value : c)),
									)
								}
							/>
						</Textarea>
					))}
					<Button
						variant="outline"
						disabled={pending}
						className={css({ alignSelf: "flex-start" })}
						onClick={() =>
							void run(
								edit
									.mutateAsync({ date, clues })
									.then((d) => d.editSeasonPuzzleClues),
							)
						}
					>
						Save clues
					</Button>
				</div>
			)}

			{!isToday && (
				<>
					<HStack gap="2" flexWrap="wrap">
						<Select value={leagueId} onValueChange={setLeagueId}>
							<Select.Trigger>
								{leagues.find((l) => l.id === leagueId)?.abbreviation ??
									"League"}
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
							disabled={pending}
							onClick={() =>
								void run(
									reroll
										.mutateAsync({ date, leagueId })
										.then((d) => d.rerollSeasonPuzzle),
								)
							}
						>
							Random season
						</Button>
					</HStack>

					<HStack gap="2" flexWrap="wrap">
						<Select
							value={teamId}
							onValueChange={(next) => {
								setTeamId(next)
								setYear(NONE)
							}}
						>
							<Select.Trigger>{franchise?.team.name ?? "Team"}</Select.Trigger>
							<Select.Content>
								{franchises.map((f) => (
									<Select.Option key={f.team.id} value={f.team.id}>
										{f.team.name}
									</Select.Option>
								))}
							</Select.Content>
						</Select>
						<Select value={year} onValueChange={setYear}>
							<Select.Trigger>
								{franchise?.seasons.find((s) => String(s.year) === year)
									?.label ?? "Season"}
							</Select.Trigger>
							<Select.Content>
								{(franchise?.seasons ?? []).map((s) => (
									<Select.Option key={s.year} value={String(s.year)}>
										{s.label}
									</Select.Option>
								))}
							</Select.Content>
						</Select>
						<Button
							variant="outline"
							disabled={pending || teamId === NONE || year === NONE}
							onClick={() =>
								void run(
									set
										.mutateAsync({ date, teamId, year: Number(year) })
										.then((d) => d.setSeasonPuzzle),
								)
							}
						>
							Use this season
						</Button>
					</HStack>

					{puzzle && otherDates.length > 0 && (
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
								disabled={pending || swapDate === NONE}
								onClick={() =>
									void run(
										swap
											.mutateAsync({ date, otherDate: swapDate })
											.then((d) => d.swapSeasonPuzzles),
									)
								}
							>
								Swap days
							</Button>
						</HStack>
					)}
				</>
			)}
		</div>
	)
}
