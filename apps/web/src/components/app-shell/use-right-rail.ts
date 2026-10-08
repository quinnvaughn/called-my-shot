import { useMatches } from "@tanstack/react-router"

// The deepest matched route's rail, if any route on the way down set one.
export function useRightRail() {
	const matches = useMatches()
	return [...matches].reverse().find((match) => match.staticData?.rightRail)
		?.staticData.rightRail
}
