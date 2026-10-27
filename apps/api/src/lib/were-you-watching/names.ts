import { teamNickname } from "@called-my-shot/schemas"

export { possessive, teamNickname } from "@called-my-shot/schemas"

// "the Celtics", as a question names a team.
export const theTeam = (fullName: string) => `the ${teamNickname(fullName)}`

export function ordinal(n: number): string {
	const tens = n % 100
	if (tens >= 11 && tens <= 13) return `${n}th`
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}

// "Jaylen Brown" -> "Brown", for the line under an answer.
export const lastName = (name: string) =>
	name
		.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "")
		.split(/\s+/)
		.at(-1) ?? name

// "1 rebound", "11 rebounds".
export const count = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`
