import {
	createContext,
	createRef,
	type ReactNode,
	type RefObject,
	useContext,
	useMemo,
	useState,
} from "react"

// The four things the first-call walkthrough points at. Three of them live
// inside cast-call-form's per-bucket field components and the fourth is
// CallSubmitBar, which the question route renders as a SIBLING of the form
// rather than a child (see use-cast-call-form.ts for why). Nothing owns all
// four, so they register themselves here instead of being prop-drilled down
// through three bucket components that otherwise have no interest in the tour.
export type TourAnchorName = "picks" | "conviction" | "payout" | "submit"

const ANCHOR_NAMES: TourAnchorName[] = [
	"picks",
	"conviction",
	"payout",
	"submit",
]

type AnchorRefCallback = (el: HTMLElement | null) => void

type TourAnchorContextValue = {
	refs: Record<TourAnchorName, RefObject<HTMLElement | null>>
	registered: TourAnchorName[]
	setters: Record<TourAnchorName, AnchorRefCallback>
}

const TourAnchorContext = createContext<TourAnchorContextValue | null>(null)

const NOOP_REF: AnchorRefCallback = () => {}

export function TourAnchorProvider({ children }: { children: ReactNode }) {
	// Which anchors have actually mounted. State rather than a bare ref for two
	// reasons: the tour has to re-render once an anchor appears so it can
	// measure it, and the step list is built from this so a question shape
	// whose form has no conviction slider (the numeric-guess bucket) runs a
	// shorter tour instead of pointing at nothing.
	const [registered, setRegistered] = useState<TourAnchorName[]>([])

	// Both of these are built exactly once. The ref callbacks in particular MUST
	// keep a stable identity: React detaches and reattaches a ref whenever the
	// callback's identity changes, so handing out a freshly created function
	// each render would call this setState on every commit and loop until React
	// bails out with "Maximum update depth exceeded". Built once, they only fire
	// on a real mount or unmount.
	const { refs, setters } = useMemo(() => {
		const refs = {} as Record<TourAnchorName, RefObject<HTMLElement | null>>
		const setters = {} as Record<TourAnchorName, AnchorRefCallback>
		for (const name of ANCHOR_NAMES) {
			refs[name] = createRef<HTMLElement>()
			setters[name] = (el: HTMLElement | null) => {
				refs[name].current = el
				setRegistered((current) => {
					const has = current.includes(name)
					if (el && !has) return [...current, name]
					if (!el && has) return current.filter((n) => n !== name)
					// Same set: returning the identical array keeps React from
					// scheduling a pointless re-render.
					return current
				})
			}
		}
		return { refs, setters }
	}, [])

	const value = useMemo(
		() => ({ refs, registered, setters }),
		[refs, registered, setters],
	)

	return (
		<TourAnchorContext.Provider value={value}>
			{children}
		</TourAnchorContext.Provider>
	)
}

// Returns a ref callback to put on whatever element the step should highlight.
// Safe to call with no provider above it: the field components that use this
// render on every question page, tour or not, and outside a tour it hands back
// one shared no-op rather than throwing.
export function useTourAnchor(name: TourAnchorName): AnchorRefCallback {
	const ctx = useContext(TourAnchorContext)
	return ctx ? ctx.setters[name] : NOOP_REF
}

export function useTourAnchors() {
	return useContext(TourAnchorContext)
}
