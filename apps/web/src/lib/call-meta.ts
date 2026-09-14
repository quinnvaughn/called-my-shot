import { questionTitleWithGame } from "@called-my-shot/schemas"
import { match, P } from "ts-pattern"
import type { CallRecordQuery } from "#/graphql/generated/graphql"

type CallQuestion = NonNullable<CallRecordQuery["call"]>["question"]

type CallMetaInput = {
	username: string
	pickLabel: string
	questionTitle: string
	game: Parameters<typeof questionTitleWithGame>[1]
	leagueAbbr: string
	shapeLabel: string
	conviction: number
	points: number | null
	isWin: boolean | null
	// A numeric guess that landed exactly, which the og:image calls "Nailed it".
	exact: boolean
	questionStatus: CallQuestion["status"]
	// All three pre-formatted by formatCallDate.
	calledAt: string
	locksAt: string
	resolvedAt: string | null
	caseText: string | null
}

const CASE_MAX = 140

// iMessage, and X since it dropped link titles under the image, show little
// or nothing past the title, so the title alone has to say who called what,
// on which question, and how it went. A bare pick ("Chicago Bears") is
// meaningless without the question it answers, and a game question's title
// ("Who will win?") is meaningless without the matchup. The description
// carries what only the platforms that show it need: league, conviction,
// dates, and the case.
export function callPageMeta(input: CallMetaInput): {
	title: string
	description: string
} {
	// The status leads, so a title truncated to its first few words still says
	// whether the call won.
	const who = `@${input.username}`
	const lead = match(input)
		.with(
			{ points: P.number, isWin: P.boolean },
			({ points, isWin, exact, pickLabel }) => {
				const signed = `${isWin ? "+" : "−"}${Math.abs(points)} pts`
				if (!isWin) return `Lost: ${who} called ${pickLabel} (${signed})`
				return exact
					? `Won: ${who} nailed ${pickLabel} exactly (${signed})`
					: `Won: ${who} called ${pickLabel} (${signed})`
			},
		)
		.with(
			{ questionStatus: "VOIDED" },
			({ pickLabel }) => `Voided: ${who} called ${pickLabel}`,
		)
		.otherwise(({ pickLabel }) => `Pending: ${who} called ${pickLabel}`)

	const question = questionTitleWithGame(input.questionTitle, input.game)

	const dates = input.resolvedAt
		? `Called ${input.calledAt}, resolved ${input.resolvedAt}`
		: match(input.questionStatus)
				.with("OPEN", () => `Called ${input.calledAt}, locks ${input.locksAt}`)
				.with("VOIDED", () => `Called ${input.calledAt}, voided`)
				.with(
					"LOCKED",
					"RESOLVED",
					"DISPUTED",
					() => `Called ${input.calledAt}, awaiting result`,
				)
				.exhaustive()

	const facts = [
		`${input.leagueAbbr} ${input.shapeLabel}`,
		`${Math.round(input.conviction)}% conviction`,
		dates,
	].join(" · ")
	const caseText = input.caseText?.trim()
	const description = caseText
		? `${facts}. "${clampText(caseText, CASE_MAX)}"`
		: `${facts}.`

	return { title: `${lead} | ${question}`, description }
}

function clampText(text: string, max: number): string {
	if (text.length <= max) return text
	return `${text.slice(0, max - 1).trimEnd()}…`
}
