import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import {
	EditRankPromptDocument,
	invalidateRankPuzzles,
	RerollRankPuzzleDocument,
	SwapRankPuzzlesDocument,
} from "#/graphql/blind-rank/mutations"
import type { RankPuzzleKind } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"

type Result =
	| { __typename: "ValidationError"; fieldErrors: { message: string }[] }
	| { __typename: string }

const KINDS: { value: RankPuzzleKind; label: string }[] = [
	{ value: "SEASON_STAT", label: "Player season" },
	{ value: "CAREER_STAT", label: "Player career" },
	{ value: "TEAM_SEASON", label: "Team season" },
	{ value: "FRANCHISE", label: "Franchise" },
]

const ANY = ""

// The overrides for one day. Every day: reword what's ranked. A day after
// today: a new random puzzle, of a kind and league if picked, or trading
// with another day. Today's is already being played, so only its wording
// can change.
export function AdminRankDayEditor({
	date,
	isToday,
	puzzle,
	leagues,
	otherDates,
}: {
	date: string
	isToday: boolean
	puzzle: { prompt: string; context: string; leagueId: string } | null
	leagues: { id: string; abbreviation: string }[]
	otherDates: { date: string; label: string }[]
}) {
	const queryClient = useQueryClient()
	const reroll = useGqlMutation(RerollRankPuzzleDocument)
	const edit = useGqlMutation(EditRankPromptDocument)
	const swap = useGqlMutation(SwapRankPuzzlesDocument)
	const [prompt, setPrompt] = useState(puzzle?.prompt ?? "")
	const [context, setContext] = useState(puzzle?.context ?? "")
	const [kind, setKind] = useState<RankPuzzleKind | typeof ANY>(ANY)
	const [leagueId, setLeagueId] = useState(
		puzzle?.leagueId ?? leagues[0]?.id ?? ANY,
	)
	const [swapDate, setSwapDate] = useState(ANY)
	const [error, setError] = useState<string | null>(null)
	const pending = reroll.isPending || edit.isPending || swap.isPending

	async function run(result: Promise<Result>) {
		setError(null)
		const data = await result
		if ("fieldErrors" in data) {
			setError(data.fieldErrors[0]?.message ?? "That didn't work.")
			return
		}
		await invalidateRankPuzzles(queryClient)
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
				<HStack gap="2" flexWrap="wrap" alignItems="flex-end">
					<TextInput className={css({ flex: 1, minWidth: "48" })}>
						<TextInput.Label>Prompt</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
							/>
						</TextInput.Group>
					</TextInput>
					<TextInput className={css({ flex: 1, minWidth: "48" })}>
						<TextInput.Label>Context</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								value={context}
								onChange={(event) => setContext(event.target.value)}
							/>
						</TextInput.Group>
					</TextInput>
					<Button
						variant="outline"
						disabled={pending}
						onClick={() =>
							void run(
								edit
									.mutateAsync({ date, prompt, context })
									.then((d) => d.editRankPrompt),
							)
						}
					>
						Save wording
					</Button>
				</HStack>
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
						<Select value={kind} onValueChange={setKind}>
							<Select.Trigger>
								{KINDS.find((k) => k.value === kind)?.label ?? "Any kind"}
							</Select.Trigger>
							<Select.Content>
								<Select.Option value={ANY}>Any kind</Select.Option>
								{KINDS.map((k) => (
									<Select.Option key={k.value} value={k.value}>
										{k.label}
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
										.mutateAsync({
											date,
											leagueId,
											kind: kind === ANY ? null : kind,
										})
										.then((d) => d.rerollRankPuzzle),
								)
							}
						>
							New puzzle
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
								disabled={pending || swapDate === ANY}
								onClick={() =>
									void run(
										swap
											.mutateAsync({ date, otherDate: swapDate })
											.then((d) => d.swapRankPuzzles),
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
