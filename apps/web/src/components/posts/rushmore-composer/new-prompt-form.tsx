import {
	defaultPromptColor,
	PROMPT_TITLE_MAX,
	PROMPT_TITLE_MIN,
	type PromptColorHex,
} from "@called-my-shot/schemas"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import {
	rushmoreLeaguesQuery,
	rushmoreTeamsQuery,
	searchPromptsQuery,
} from "#/graphql/posts/composer-queries"
import {
	CreateRushmorePromptDocument,
	postErrorMessage,
} from "#/graphql/posts/mutations"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { RoomLeft } from "../room-left"
import { ColorSwatches } from "./color-swatches"
import { choiceList } from "./composer-styles"
import { PositionChips } from "./position-chips"
import { PromptRow } from "./prompt-row"
import { YearRangeFields } from "./year-range-fields"

const ANY = "any"

// Making a prompt nobody has asked yet, starting from what was searched for.
// Picks come from anyone in any league unless it's narrowed to one league or
// one of its teams, and with a league to some of its positions; any of them
// can also be held to the years someone played. What's typed is checked against the prompts in that
// scope as it goes, and any close ones are offered first, so people answer
// the one that exists rather than start a second.
export function NewPromptForm({
	initialTitle,
	onBack,
	onChoose,
}: {
	initialTitle: string
	onBack: () => void
	onChoose: (code: string) => void
}) {
	const [title, setTitle] = useState(initialTitle)
	const [leagueValue, setLeagueValue] = useState<string>(ANY)
	const [teamValue, setTeamValue] = useState<string>(ANY)
	const [positions, setPositions] = useState<string[]>([])
	const [fromYear, setFromYear] = useState<number | null>(null)
	const [toYear, setToYear] = useState<number | null>(null)
	// Null until one is picked: the title chooses meanwhile.
	const [chosenColor, setChosenColor] = useState<PromptColorHex | null>(null)
	const [error, setError] = useState<string | null>(null)
	const create = useGqlMutation(CreateRushmorePromptDocument)
	const debounced = useDebouncedValue(title.trim(), 300)
	const leagueId = leagueValue === ANY ? null : leagueValue
	const team = leagueId && teamValue !== ANY ? teamValue : null

	const { data: leaguesData } = useQuery(rushmoreLeaguesQuery)
	const leagues = (leaguesData?.leagues ?? []).filter(
		(league) => league.status === "ACTIVE",
	)
	const { data: teamsData } = useQuery({
		...rushmoreTeamsQuery(leagueId ?? "", ""),
		enabled: !!leagueId,
	})
	const teams = leagueId ? (teamsData?.teams ?? []) : []
	const league = leagues.find((l) => l.id === leagueId) ?? null
	const teamName = teams.find((t) => t.id === team)?.name ?? null
	const { data: similarData } = useQuery({
		...searchPromptsQuery({
			leagueId,
			teamId: team,
			query: debounced,
			first: 5,
		}),
		enabled: debounced.length >= PROMPT_TITLE_MIN,
		placeholderData: keepPreviousData,
	})
	const similar =
		debounced.length >= PROMPT_TITLE_MIN
			? (similarData?.searchPrompts ?? [])
			: []
	const trimmed = title.trim()
	const tooShort = trimmed.length < PROMPT_TITLE_MIN
	const color = chosenColor ?? defaultPromptColor(trimmed)

	async function submit() {
		setError(null)
		const result = (
			await create.mutateAsync({
				input: {
					title: trimmed,
					leagueId,
					teamId: team,
					positions: leagueId ? positions : [],
					// A team's prompt is drawn in the team's color.
					color: team ? null : color,
					fromYear,
					toYear,
				},
			})
		)?.createRushmorePrompt
		if (result?.__typename !== "RushmorePromptPayload") {
			setError(postErrorMessage(result))
			return
		}
		onChoose(result.prompt.code)
	}

	return (
		<VStack gap="4" alignItems="stretch">
			<button
				type="button"
				onClick={onBack}
				className={arrowLink({ tone: "quiet" })}
			>
				← Back to search
			</button>
			<TextInput
				description={`Just what it's of, like 2010s point guards. ${PROMPT_TITLE_MIN} to ${PROMPT_TITLE_MAX} characters.`}
			>
				<HStack justify="space-between" gap="2">
					<TextInput.Label>Mount Rushmore of</TextInput.Label>
					<RoomLeft value={title} max={PROMPT_TITLE_MAX} within={15} />
				</HStack>
				<TextInput.Group>
					<TextInput.Field
						autoComplete="off"
						maxLength={PROMPT_TITLE_MAX}
						placeholder="Point guards of all time"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel>League</FieldLabel>
				<Select
					value={leagueValue}
					onValueChange={(value) => {
						setLeagueValue(value)
						setTeamValue(ANY)
						setPositions([])
					}}
				>
					<Select.Trigger>
						{leagues.find((l) => l.id === leagueValue)?.name ?? "Any sport"}
					</Select.Trigger>
					<Select.Content>
						<Select.Option value={ANY}>Any sport</Select.Option>
						{leagues.map((l) => (
							<Select.Option key={l.id} value={l.id}>
								{l.name}
							</Select.Option>
						))}
					</Select.Content>
				</Select>
			</VStack>
			{leagueId && (
				<VStack gap="1.5" alignItems="stretch">
					<FieldLabel>Team (optional)</FieldLabel>
					<Select value={teamValue} onValueChange={setTeamValue}>
						<Select.Trigger>
							{teams.find((t) => t.id === teamValue)?.name ??
								"Any team in the league"}
						</Select.Trigger>
						<Select.Content>
							<Select.Option value={ANY}>Any team in the league</Select.Option>
							{teams.map((t) => (
								<Select.Option key={t.id} value={t.id}>
									{t.name}
								</Select.Option>
							))}
						</Select.Content>
					</Select>
				</VStack>
			)}
			{league && (
				<PositionChips
					leagueAbbreviation={league.abbreviation}
					value={positions}
					onChange={setPositions}
				/>
			)}
			{!team && <ColorSwatches value={color} onChange={setChosenColor} />}
			<YearRangeFields
				from={fromYear}
				to={toYear}
				onFromChange={setFromYear}
				onToChange={setToYear}
			/>
			<FieldHint>
				{pickScopeHint({
					where: teamName
						? `for the ${teamName}`
						: league
							? `in the ${league.abbreviation}`
							: "in any league",
					positions: league ? positions : [],
					fromYear,
					toYear,
				})}
			</FieldHint>
			{similar.length > 0 && (
				<VStack gap="2" alignItems="stretch">
					<p className={css({ fontSize: "sm", color: "fg.body" })}>
						These already exist. Answer one of them so your picks count toward
						its consensus.
					</p>
					<div className={choiceList}>
						{similar.map((prompt) => (
							<PromptRow key={prompt.id} prompt={prompt} onChoose={onChoose} />
						))}
					</div>
				</VStack>
			)}
			<FormError message={error} />
			<Button
				onClick={() => void submit()}
				loading={create.isPending}
				disabled={tooShort}
			>
				{similar.length > 0 ? "Make a new prompt anyway" : "Make this prompt"}
			</Button>
		</VStack>
	)
}

// Who can be picked, in one sentence: "Anyone who played for the Boston
// Celtics, at PG or SG, from 2010 through 2019 can be picked."
function pickScopeHint({
	where,
	positions,
	fromYear,
	toYear,
}: {
	where: string
	positions: string[]
	fromYear: number | null
	toYear: number | null
}): string {
	const parts = [where]
	if (positions.length > 0) {
		parts.push(
			`at ${positions.length === 1 ? positions[0] : `${positions.slice(0, -1).join(", ")} or ${positions[positions.length - 1]}`}`,
		)
	}
	if (fromYear !== null && toYear !== null) {
		parts.push(`from ${fromYear} through ${toYear}`)
	} else if (fromYear !== null) {
		parts.push(`in ${fromYear} or later`)
	} else if (toYear !== null) {
		parts.push(`in ${toYear} or earlier`)
	}
	return `Anyone who played ${parts.join(", ")} can be picked.`
}
