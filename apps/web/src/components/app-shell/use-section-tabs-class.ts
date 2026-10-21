import { useStore } from "@tanstack/react-store"
import { css } from "styled-system/css"
import { sidebarCollapsedStore } from "#/stores/sidebar-collapsed-store"

const phoneOnly = css({ display: { base: "flex", md: "none" } })

// For a league's or group's own tab row. From md up the side column lists
// the same sections, so the row only shows there while the column is
// collapsed. Below md there's no column, so it always shows.
export function useSectionTabsClass() {
	const collapsed = useStore(sidebarCollapsedStore, (state) => state)
	return collapsed ? undefined : phoneOnly
}
