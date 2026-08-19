import { useEffect, useState } from "react"

// Holds the last value until `delayMs` has passed without it changing again -
// for anything that fires a request per keystroke (username availability)
// and shouldn't.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value)

	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delayMs)
		return () => clearTimeout(id)
	}, [value, delayMs])

	return debounced
}
