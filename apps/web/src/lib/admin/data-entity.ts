import { DateTime } from "luxon"

export function statusOptionLabel(status: string) {
	return status === "active" ? "Active" : "Inactive"
}

// Matches DateTimePicker's own VALUE_FORMAT so an existing game's ISO
// startsAt round-trips into the picker's edit-in-place value shape.
export function toDateTimeLocal(iso: string) {
	return DateTime.fromISO(iso).toFormat("yyyy-MM-dd'T'HH:mm")
}
