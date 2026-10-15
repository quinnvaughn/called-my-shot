import { useEffect, useState } from "react"

const STORAGE_KEY = "sidebar-collapsed"

// Whether the desktop sidebar is collapsed, remembered per browser. Expanded
// is the default and what the server renders, so a reader who collapsed it
// sees it fold away once the page hydrates. `animated` turns on with the
// first toggle, so that restore happens in one step rather than as a slide.
export function useSidebarCollapsed() {
	const [collapsed, setCollapsed] = useState(false)
	const [animated, setAnimated] = useState(false)

	useEffect(() => {
		try {
			if (localStorage.getItem(STORAGE_KEY) === "true") setCollapsed(true)
		} catch {}
	}, [])

	function toggle() {
		setAnimated(true)
		setCollapsed((wasCollapsed) => {
			try {
				if (wasCollapsed) localStorage.removeItem(STORAGE_KEY)
				else localStorage.setItem(STORAGE_KEY, "true")
			} catch {}
			return !wasCollapsed
		})
	}

	return { collapsed, animated, toggle }
}
