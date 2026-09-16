import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { MultiSelect, Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import type {
	CallResultFilter,
	QuestionScope,
	QuestionShape,
} from "#/graphql/generated/graphql"
import {
	questionShapeFamily,
	questionShapeLabel,
	SHAPE_FAMILIES,
	shapeFamilyLabel,
} from "#/lib/question-labels"

// The league rows this reads out of router context (_app.tsx's beforeLoad) -
// structurally what LeaguesDocument selects, declared here so this module
// doesn't depend on a generated query type. Same reasoning (and shape) as
// FilterLeague in lib/leaderboard-filter.ts.
export type FilterLeague = {
	id: string
	name: string
	abbreviation: string
}

export type QuestionFilterValue = {
	search: string
	leagueId: string | null
	shapes: QuestionShape[]
	scope: QuestionScope | null
	// Only ever set where showResult is on - an unsettled call has no outcome
	// to filter by.
	result: CallResultFilter | null
}

export const EMPTY_FILTERS: QuestionFilterValue = {
	search: "",
	leagueId: null,
	shapes: [],
	scope: null,
	result: null,
}

export function hasActiveFilters(value: QuestionFilterValue): boolean {
	return (
		value.search.trim() !== "" ||
		value.leagueId !== null ||
		value.shapes.length > 0 ||
		value.scope !== null ||
		value.result !== null
	)
}

type Props = {
	value: QuestionFilterValue
	onChange: (next: QuestionFilterValue) => void
	leagues: FilterLeague[]
	// The Resolved tab only. Off elsewhere, and the value is cleared alongside
	// it by the caller so a hidden filter can't keep narrowing the list.
	showResult?: boolean
	searchPlaceholder: string
}

const ALL = "all"

// Fixed width on every trigger: it's content-width by default, so switching
// "All leagues" to "NFL" would resize it and shove its neighbours along the
// row. Same reasoning as the leaderboard's season picker.
const control = css({ width: "44", flexShrink: "0" })

const clearButton = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
	background: "none",
	border: "none",
	padding: "0",
	cursor: "pointer",
	alignSelf: "flex-start",
	_hover: { color: "fg.default", textDecoration: "underline" },
})

// The filter row shared by My Calls and My Questions. Purely presentational -
// it owns no state and does no fetching; each page holds its own filter value
// and folds it into its query key, the same way the league Community tab does.
export function QuestionFilterBar({
	value,
	onChange,
	leagues,
	showResult,
	searchPlaceholder,
}: Props) {
	function set<K extends keyof QuestionFilterValue>(
		key: K,
		next: QuestionFilterValue[K],
	) {
		onChange({ ...value, [key]: next })
	}

	const league = leagues.find((l) => l.id === value.leagueId)

	return (
		<VStack alignItems="stretch" gap="3">
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder={searchPlaceholder}
						value={value.search}
						onChange={(e) => set("search", e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>

			<HStack gap="2" flexWrap="wrap">
				<Select
					value={value.leagueId ?? ALL}
					onValueChange={(next) => set("leagueId", next === ALL ? null : next)}
					className={control}
				>
					<Select.Trigger>
						{league ? league.abbreviation : "All leagues"}
					</Select.Trigger>
					<Select.Content>
						<Select.Option value={ALL}>All leagues</Select.Option>
						{leagues.map((l) => (
							<Select.Option key={l.id} value={l.id}>
								{l.abbreviation}
							</Select.Option>
						))}
					</Select.Content>
				</Select>

				{/* Grouped rather than a flat list of all 18 - see SHAPE_FAMILIES. */}
				<MultiSelect
					value={value.shapes}
					onValueChange={(next) => set("shapes", next)}
					className={control}
				>
					<MultiSelect.Trigger>
						{shapeTriggerLabel(value.shapes)}
					</MultiSelect.Trigger>
					<MultiSelect.Content>
						{SHAPE_FAMILIES.map((family) => (
							<div key={family}>
								<MultiSelect.GroupLabel>
									{shapeFamilyLabel[family]}
								</MultiSelect.GroupLabel>
								{shapesInFamily(family).map((shape) => (
									<MultiSelect.Option key={shape} value={shape}>
										{questionShapeLabel[shape]}
									</MultiSelect.Option>
								))}
							</div>
						))}
					</MultiSelect.Content>
				</MultiSelect>

				<Select
					value={value.scope ?? ALL}
					onValueChange={(next) =>
						set("scope", next === ALL ? null : (next as QuestionScope))
					}
					className={control}
				>
					<Select.Trigger>{scopeLabel(value.scope)}</Select.Trigger>
					<Select.Content>
						<Select.Option value={ALL}>Game & season</Select.Option>
						<Select.Option value="GAME">Single game</Select.Option>
						<Select.Option value="SEASON_LONG">Season long</Select.Option>
					</Select.Content>
				</Select>

				{showResult && (
					<Select
						value={value.result ?? ALL}
						onValueChange={(next) =>
							set("result", next === ALL ? null : (next as CallResultFilter))
						}
						className={control}
					>
						<Select.Trigger>{resultLabel(value.result)}</Select.Trigger>
						<Select.Content>
							<Select.Option value={ALL}>Any result</Select.Option>
							<Select.Option value="HIT">Hits</Select.Option>
							<Select.Option value="MISS">Misses</Select.Option>
							<Select.Option value="UNSCORED">Unscored</Select.Option>
						</Select.Content>
					</Select>
				)}
			</HStack>

			{hasActiveFilters(value) && (
				<button
					type="button"
					className={clearButton}
					onClick={() => onChange(EMPTY_FILTERS)}
				>
					Clear filters
				</button>
			)}
		</VStack>
	)
}

function shapesInFamily(family: (typeof SHAPE_FAMILIES)[number]) {
	return (Object.keys(questionShapeFamily) as QuestionShape[]).filter(
		(shape) => questionShapeFamily[shape] === family,
	)
}

// The shape's own name while exactly one is picked, a count past that - the
// trigger is one fixed-width line, and two full shape names never fit it.
function shapeTriggerLabel(shapes: QuestionShape[]): string {
	if (shapes.length === 0) return "All shapes"
	if (shapes.length === 1 && shapes[0]) return questionShapeLabel[shapes[0]]
	return `${shapes.length} shapes`
}

function scopeLabel(scope: QuestionScope | null): string {
	return match(scope)
		.with("GAME", () => "Single game")
		.with("SEASON_LONG", () => "Season long")
		.with(null, () => "Game & season")
		.exhaustive()
}

function resultLabel(result: CallResultFilter | null): string {
	return match(result)
		.with("HIT", () => "Hits")
		.with("MISS", () => "Misses")
		.with("UNSCORED", () => "Unscored")
		.with(null, () => "Any result")
		.exhaustive()
}
