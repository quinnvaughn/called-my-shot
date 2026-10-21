import { useStore } from "@tanstack/react-store"
import { useEffect, useState } from "react"
import {
	restoreSidebarCollapsed,
	sidebarCollapsedStore,
	toggleSidebarCollapsed,
} from "#/stores/sidebar-collapsed-store"

// The side column's collapsed state, for the column itself. A reader who
// collapsed it sees it fold away once the page hydrates. `animated` turns on
// with the first toggle, so that restore happens in one step rather than as
// a slide.
export function useSidebarCollapsed() {
	const collapsed = useStore(sidebarCollapsedStore, (state) => state)
	const [animated, setAnimated] = useState(false)

	useEffect(() => {
		restoreSidebarCollapsed()
	}, [])

	function toggle() {
		setAnimated(true)
		toggleSidebarCollapsed()
	}

	return { collapsed, animated, toggle }
}
