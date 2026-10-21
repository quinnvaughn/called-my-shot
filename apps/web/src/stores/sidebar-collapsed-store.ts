import { Store } from "@tanstack/react-store"

// Whether the desktop side column is collapsed, remembered per browser.
// Shared rather than held by the column, because league and group pages
// show their own tab row only while it's collapsed (it lists the same
// sections). Expanded is the default and what the server renders; the app
// shell restores a saved collapse once the page hydrates.
const STORAGE_KEY = "sidebar-collapsed"

export const sidebarCollapsedStore = new Store(false)

export function restoreSidebarCollapsed() {
	try {
		if (localStorage.getItem(STORAGE_KEY) === "true") {
			sidebarCollapsedStore.setState(() => true)
		}
	} catch {}
}

export function toggleSidebarCollapsed() {
	sidebarCollapsedStore.setState((wasCollapsed) => {
		try {
			if (wasCollapsed) localStorage.removeItem(STORAGE_KEY)
			else localStorage.setItem(STORAGE_KEY, "true")
		} catch {}
		return !wasCollapsed
	})
}
