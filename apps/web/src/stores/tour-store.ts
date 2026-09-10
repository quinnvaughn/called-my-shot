import { Store } from "@tanstack/react-store"

// Which step of the first-call walkthrough is showing, or null when no tour is
// running. Only the step index lives here - whether the tour was requested at
// all is a `?tour=first-call` search param on the question route, so a reload
// or a pasted link resumes the walkthrough instead of stranding the user
// halfway through it. Same shape and reasoning as stores/modal-store.ts.
export const tourStepStore = new Store<number | null>(null)

// Whether the walkthrough ran on this page, for the cast-call submit handler
// to decide whether to show the closing "that's a call" modal.
//
// Deliberately not the ?tour search param: the tour clears that when it ends,
// which is well before the user gets around to actually submitting. A plain
// module variable rather than a Store because nothing renders from it - it is
// read once, inside an event handler.
let ranFirstCallTour = false

export function startTour() {
	ranFirstCallTour = true
	tourStepStore.setState(() => 0)
}

// Reads and clears in one go, so a second call on the same page (they made
// another call later) does not replay the closing modal.
export function consumeRanFirstCallTour(): boolean {
	const ran = ranFirstCallTour
	ranFirstCallTour = false
	return ran
}

// Advancing past the last step is the tour finishing, which is the same state
// as never having started one. The caller decides what "finished" means (see
// use-first-call-tour.ts, which strips the search param at the same time).
export function advanceTour(total: number) {
	tourStepStore.setState((step) => {
		if (step === null) return null
		return step + 1 >= total ? null : step + 1
	})
}

// Stepping back off step 0 would be leaving the tour, which is what Skip is
// for - this just refuses instead, so Back never has a surprising second job.
export function goBackTour() {
	tourStepStore.setState((step) => {
		if (step === null) return null
		return Math.max(0, step - 1)
	})
}

export function endTour() {
	tourStepStore.setState(() => null)
}
