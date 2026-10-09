// A presser mutation's result, read as the error to show or null when it
// went through.
export function presserResultError(
	result:
		| { __typename: "PresserPayload" }
		| {
				__typename: "ValidationError"
				message: string
				fieldErrors: { message: string }[]
		  }
		| { __typename: string; message?: string }
		| null
		| undefined,
): string | null {
	if (!result) return "Something went wrong. Try again."
	if (result.__typename === "PresserPayload") return null
	if ("fieldErrors" in result && result.fieldErrors[0]) {
		return result.fieldErrors[0].message
	}
	return (
		("message" in result && result.message) ||
		"Something went wrong. Try again."
	)
}

// "Closes in 31h", "Closes within the hour"
export function closesInLabel(closesAt: string, now = Date.now()): string {
	const hours = Math.floor((new Date(closesAt).getTime() - now) / 3_600_000)
	return hours < 1 ? "Closes within the hour" : `Closes in ${hours}h`
}
