import { SHAPE_SUBJECT } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { pluralize } from "#/lib/pluralize"
import { useQuestionData } from "../data-context"
import type { CreateQuestionValues } from "../form-context"
import {
	ChipField,
	MultiSelectField,
	NumberField,
	NumberMultiSelectField,
	TextField,
	ToggleField,
	useSetValue,
	useWatch,
} from "../form-context"
import { LeagueField } from "../league-field"
import { PoolSummary } from "../pool-summary"
import { divisionsIn } from "../use-question-catalog"
import { ShapePanel } from "./shape-panel"

// "Rookie (0)" / "1 year" / "2 years" - shared between the option labels in
// the years-in-league picker and the pool summary's scopeLabel, so the two
// can't drift.
function yearsInLeagueLabel(years: number): string {
	return years === 0 ? "Rookie (0)" : `${years} ${pluralize(years, "year")}`
}

function toOptions(values: string[]) {
	return values.map((value) => ({ value, label: value }))
}

export type AwardShape = Extract<
	CreateQuestionValues["shape"],
	"player_season_award" | "team_season_award"
>

// player_season_award and team_season_award. The pool is the whole league
// roster, optionally narrowed to a conference/division/position/experience for
// awards that are genuinely scoped in reality (AL MVP vs NL MVP) rather than
// hand-curated row by row - nobody's adding hundreds of players one at a time.
export function AwardPanel({ shape }: { shape: AwardShape }) {
	const isPlayerAward = SHAPE_SUBJECT[shape] === "player"
	const setValue = useSetValue()

	const awardName = useWatch("awardName")
	const awardConferences = useWatch("awardConferences")
	const awardDivisions = useWatch("awardDivisions")
	const awardPositions = useWatch("awardPositions")
	const awardSeasonsInLeague = useWatch("awardSeasonsInLeague")
	const awardRookieOnly = useWatch("awardRookieOnly")

	const {
		teams,
		conferenceOptions,
		divisionOptions,
		positionOptions,
		yearsInLeagueOptions,
		awardPoolItems,
	} = useQuestionData("AwardPanel")

	return (
		<ShapePanel label="The award">
			<LeagueField />
			<HStack gap="3.5">
				<div className={css({ flex: "1" })}>
					<MultiSelectField
						name="awardConferences"
						label="Conference"
						emptyLabel="Whole league"
						options={toOptions(conferenceOptions)}
						onValueChange={(next) => {
							// Divisions are conference-scoped (see
							// requireConferenceBeforeDivision in the schema), so
							// deselecting a conference drops any picked division that
							// no longer belongs to one still selected.
							const allowed = new Set(divisionsIn(teams, next))
							const kept = awardDivisions.filter((d) => allowed.has(d))
							if (kept.length !== awardDivisions.length) {
								setValue("awardDivisions", kept)
							}
						}}
					/>
				</div>
				<div className={css({ flex: "1" })}>
					<MultiSelectField
						name="awardDivisions"
						label="Division"
						emptyLabel={
							awardConferences.length
								? "Whole conference"
								: "Pick a conference first"
						}
						options={toOptions(divisionOptions)}
					/>
				</div>
			</HStack>
			{isPlayerAward && (
				<MultiSelectField
					name="awardPositions"
					label="Position"
					emptyLabel="Every position"
					options={toOptions(positionOptions)}
				/>
			)}
			{isPlayerAward && (
				<NumberMultiSelectField
					name="awardSeasonsInLeague"
					label="Years in the league"
					emptyLabel="Any experience"
					options={yearsInLeagueOptions.map((years) => ({
						value: years,
						label: yearsInLeagueLabel(years),
					}))}
					hint={`Pick one or more exact years - e.g. "Rookie (0)" for Rookie of the Year.`}
				/>
			)}
			{isPlayerAward && (
				<ToggleField
					name="awardRookieOnly"
					label="Rookie of the Year only"
					description={`Narrows the pool to players who are actually rookie-eligible this season, per this sport's own real rule - not just "Years in the league" = 0.`}
					onValueChange={(next) => {
						// Flipping this on always means the award is Rookie of the Year -
						// only backfill the name when it's still blank so it doesn't
						// clobber something the admin already typed (e.g. a per-position
						// variant). awardName is watched here rather than passed in, so
						// this guard always reads the current value.
						if (next && !awardName) {
							setValue("awardName", "Rookie of the Year")
						}
					}}
				/>
			)}
			<TextField
				name="awardName"
				label="Award name"
				required
				placeholder="MVP"
				description={`The award's real name, e.g. "MVP" or "Rookie of the Year."`}
			/>
			<ChipField
				name="awardVerb"
				label="Win or be"
				required
				hint={`"Win" for a single-winner race (MVP). "Be" for a role or slot (an All-NBA First Team spot, a positional Gold Glove).`}
				options={[
					["win", "Win"],
					["be", "Be"],
				]}
			/>
			<div className={css({ width: "64" })}>
				<NumberField
					name="picksRequired"
					label="Winners"
					required
					min={1}
					max={15}
					description="1 for a single-winner award (MVP). Higher for a fixed-size group award (an All-NBA team)."
				/>
			</div>
			{awardPoolItems === null ? (
				<FieldHint>Pick a league to see the pool.</FieldHint>
			) : (
				<PoolSummary
					items={awardPoolItems}
					scopeLabel={[
						awardConferences.join("/"),
						awardDivisions.join("/"),
						awardPositions.join("/"),
						awardSeasonsInLeague.map(yearsInLeagueLabel).join("/"),
					]
						.filter(Boolean)
						.join(" ")}
					rookieOnly={awardRookieOnly}
				/>
			)}
		</ShapePanel>
	)
}
