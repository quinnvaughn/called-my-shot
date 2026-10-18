import type { UpdateLineSettingInput } from "@called-my-shot/schemas"
import {
	GAME_QUESTION_CATALOG,
	type GameQuestionTemplate,
} from "../../db/catalog/game-question-catalog"
import {
	type GameQuestionLineSetting,
	gameQuestionLineSettings,
} from "../../db/schema"
import {
	type CalibrationRow,
	lineCalibration,
	nextShade,
	ratioKey,
	ratiosByTemplate,
} from "./line-calibration"
import {
	formulaFor,
	GENERATED_OVER_UNDER_SHAPES,
	isGameModelShape,
	type LineRule,
} from "./lines"
import { defineTunableSetting, type SettingState } from "./tunable-setting"

export type OverUnderTemplate = Extract<
	GameQuestionTemplate,
	{ shape: (typeof GENERATED_OVER_UNDER_SHAPES)[number] }
>

// Both over/under templates carry a LineRule, so everything the Lines page
// and the tuner do to one works on the other unchanged.
export function isGeneratedOverUnder(
	template: GameQuestionTemplate,
): template is OverUnderTemplate {
	return (GENERATED_OVER_UNDER_SHAPES as readonly string[]).includes(
		template.shape,
	)
}

type LeagueOverUnder = OverUnderTemplate & { leagueSlug: string }

// Only a team over/under carries an opponent weight, so a player one always
// sets its lines the original way.
const formulaOf = (template: OverUnderTemplate) =>
	formulaFor("oppWeight" in template ? template.oppWeight : undefined)

// Every over/under template in the catalog, by league then catalog order.
function overUnderTemplates(): LeagueOverUnder[] {
	return Object.entries(GAME_QUESTION_CATALOG).flatMap(
		([leagueSlug, templates]) =>
			templates.flatMap((template) =>
				isGeneratedOverUnder(template) ? [{ ...template, leagueSlug }] : [],
			),
	)
}

// One over/under template as the admin Lines page shows it: the settings its
// lines are set from now, the catalog's own, whether tuneLines is moving its
// shade, and how the lines set at the current shade have landed.
export type LineSettingRow = SettingState & {
	leagueSlug: string
	templateId: string
	statName: string
	line: LineRule
	defaultLine: LineRule
	// Whether its lines are read off a game's score model (see
	// game-score-model.ts), which leaves the shade to the first weeks of a
	// league's history only and keeps the tuner off it.
	setByGameModel: boolean
	calibration: CalibrationRow | null
}

const ruleOf = (row: GameQuestionLineSetting): LineRule => ({
	shade: row.shade,
	minLine: row.minLine,
	minGames: row.minGames,
})

// The rule a template's lines are set with: its saved settings where it has
// any, otherwise the catalog's. A game model template's are never shaded. Its
// team lines and its game total are set from the same expected scores, so a
// shade tuned on one and not the other posts team lines that don't add up to
// the total, and the score model itself needs none: its line already sits
// where the over is closest to even.
function effectiveRule(
	template: OverUnderTemplate,
	saved: LineRule | undefined,
): LineRule {
	const rule = saved ?? template.line
	return isGameModelShape(template.shape) ? { ...rule, shade: 1 } : rule
}

const sameRule = (a: LineRule, b: LineRule) =>
	a.shade === b.shade && a.minLine === b.minLine && a.minGames === b.minGames

const settings = defineTunableSetting({
	table: gameQuestionLineSettings,
	keyField: "templateId",
	tunedField: "shade",
	templates: overUnderTemplates,
	keyOf: (template) => template.id,
	valueOf: ruleOf,
	tune: {
		job: "tune-lines",
		label: "shade",
		unit: "template(s)",
		load: ratiosByTemplate,
		defaultValue: (template) => template.line.shade,
		// A game model template's lines don't read its shade once the model can
		// be built, so tuning it would only move a number nothing uses.
		next: (current, template, ratios) =>
			isGameModelShape(template.shape)
				? null
				: nextShade(
						current,
						ratios.get(
							ratioKey(template.leagueSlug, template.id, formulaOf(template)),
						) ?? [],
					),
		// Minimum games and the lowest line stay as they are.
		insertDefaults: (template) => ({
			minLine: template.line.minLine,
			minGames: template.line.minGames,
		}),
	},
	rows: {
		load: () => lineCalibration(),
		build: (template, saved, calibration) => {
			const line = effectiveRule(template, saved ? ruleOf(saved) : undefined)
			const setByGameModel = isGameModelShape(template.shape)
			return {
				leagueSlug: template.leagueSlug,
				templateId: template.id,
				statName: template.statName,
				line,
				defaultLine: template.line,
				setByGameModel,
				// The current model only: a row from an older one describes lines
				// this template no longer sets, so showing it beside today's
				// settings would read as their calibration.
				calibration:
					calibration.find(
						(c) =>
							c.league === template.leagueSlug &&
							c.template === template.id &&
							c.shade === (setByGameModel ? null : line.shade) &&
							c.formula === formulaOf(template),
					) ?? null,
			}
		},
	},
})

// Each over/under template's line settings, its shade tuned toward the over
// hitting half the time.
export const lineSettings = {
	...settings,
	// Saving the catalog's own settings with tuning on clears the row, so the
	// template follows the catalog again.
	save: async (
		input: UpdateLineSettingInput,
		updatedById: string,
	): Promise<void> => {
		const template = settings.template(input.leagueSlug, input.templateId)
		if (input.autoTune && template && sameRule(input, template.line)) {
			return settings.reset(input.leagueSlug, input.templateId)
		}
		return settings.save(input, updatedById)
	},
}

export const loadLineSettings = lineSettings.loadLeague

// Each over/under template set from its saved settings where it has any.
export function withLineSettings(
	templates: GameQuestionTemplate[],
	saved: Map<string, LineRule>,
): GameQuestionTemplate[] {
	return templates.map((template) =>
		isGeneratedOverUnder(template)
			? { ...template, line: effectiveRule(template, saved.get(template.id)) }
			: template,
	)
}
