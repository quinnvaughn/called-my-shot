import { arcadeDay, isArcadeDay } from "../../../lib/arcade/day"
import { ValidationError } from "../../../lib/errors"

// A day an admin override can change: a real date, and after today, since
// today's puzzle is already being played.
export function futureArcadeDay(date: string): string {
	if (!isArcadeDay(date)) {
		throw ValidationError.field("date", "That isn't a date.")
	}
	if (date <= arcadeDay(new Date())) {
		throw ValidationError.field("date", "Pick a day after today.")
	}
	return date
}
