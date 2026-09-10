import { useStore } from "@tanstack/react-store"
import { useEffect, useRef } from "react"
import { Coachmark } from "#/components/ui/coachmark"
import { track } from "#/lib/analytics"
import { modalStore } from "#/stores/modal-store"
import {
	advanceTour,
	endTour,
	goBackTour,
	startTour,
	tourStepStore,
} from "#/stores/tour-store"
import { type TourAnchorName, useTourAnchors } from "./tour-anchors"

// How a step ends.
//
// "pick-an-option" leads with the action instead of a Next button: doing the
// thing advances the tour, which is the whole point of explaining it here
// rather than on a rules page. It still offers a quiet "Skip step", so it
// prompts without trapping.
//
// Only reversible actions are ever gated this way. Submitting a call is not
// reversible, so the final step is a "read" - see its comment below.
//
// "read" steps are explanation with nothing to do, so they get Next.
type StepGate = "pick-an-option" | "read"

type TourStep = {
	anchor: TourAnchorName
	title: string
	body: string
	gate: StepGate
	hint?: string
}

const STEPS: TourStep[] = [
	{
		anchor: "picks",
		title: "Make the call",
		body: "Pick the outcome you actually believe. You get one call per question, and it locks when the event starts.",
		gate: "pick-an-option",
		hint: "Pick one to continue",
	},
	{
		anchor: "conviction",
		title: "Conviction is your stake",
		body: "Set it anywhere from 1 to 100. It scales what a hit pays and what a miss costs by the same amount, so it is how much you are willing to be wrong about this.",
		gate: "read",
	},
	{
		// Describes the shape of the multiplier rather than quoting its 6x
		// ceiling. On a two-option question the bonus is a flat 1x until about
		// 20% of the field is on your side, and 6x needs roughly 1%, so leading
		// with the cap would sell a number almost nobody sees here. The preview
		// underneath is live, so point at that instead.
		anchor: "payout",
		title: "What it actually pays",
		body: "This updates as you pick. Calling it the same way as the field pays the base rate. A multiplier only starts once you are well under an even share of the calls, and it climbs quickly from there. A miss costs your conviction flat either way, so a bold call never deepens the loss.",
		gate: "read",
	},
	{
		// Explanation, not a gate. Picking an option is a harmless, reversible
		// thing to make someone do to continue; actually submitting a call is
		// not, and a walkthrough that will not end until you commit to a real
		// pick is a walkthrough people resent. They can close this and sit on
		// the question as long as they like.
		anchor: "submit",
		title: "Lock it in when you're ready",
		body: "You get a last look before it counts. Once a call is locked it cannot be changed, and it scores when the result is official.",
		gate: "read",
	},
]

type Props = {
	// Whether the user has picked something yet - the first step's exit.
	hasSelection: boolean
	// Clears ?tour from the URL when the tour ends, however it ends, so a
	// reload does not replay it.
	onFinish: () => void
}

export function FirstCallTour({ hasSelection, onFinish }: Props) {
	const anchors = useTourAnchors()
	const step = useStore(tourStepStore, (s) => s)
	// The review modal would cover the coachmark, so step aside while it is up.
	const modalOpen = useStore(modalStore, (s) => s.length > 0)

	// Only steps whose anchor actually mounted. The numeric-guess and
	// multi-select buckets render different fields (no single conviction
	// slider, no per-option payout preview), so those run a shorter tour rather
	// than pointing a coachmark at an element that is not there.
	const steps = STEPS.filter((s) => anchors?.registered.includes(s.anchor))
	const total = steps.length
	const index = step === null ? null : Math.min(step, total - 1)
	const current = index === null ? null : (steps[index] ?? null)

	const gateSatisfied =
		current !== null && current.gate === "pick-an-option" && hasSelection

	useEffect(() => {
		if (total > 0 && tourStepStore.state === null) {
			startTour()
			track("onboarding_started", { surface: "first_call_tour" })
		}
	}, [total])

	useEffect(() => {
		if (step !== null) track("first_call_tour_step", { step })
	}, [step])

	// Advances only on the moment the gate BECOMES satisfied, never on a step
	// that was already satisfied when it was entered. Without that distinction,
	// stepping Back to "pick one" after picking would immediately throw the
	// user forward again and Back would look broken.
	const seen = useRef<{ index: number; satisfied: boolean } | null>(null)
	useEffect(() => {
		if (index === null || current === null) return
		const previous = seen.current
		seen.current = { index, satisfied: gateSatisfied }

		const justArrived = previous === null || previous.index !== index
		if (justArrived || previous.satisfied || !gateSatisfied) return

		if (index >= total - 1) {
			endTour()
			onFinish()
			return
		}
		advanceTour(total)
	}, [index, current, gateSatisfied, total, onFinish])

	if (step === null || current === null || index === null || !anchors) {
		return null
	}
	if (modalOpen) return null

	function finish() {
		endTour()
		onFinish()
	}

	function goNext() {
		if (index === null) return
		if (index >= total - 1) {
			finish()
			return
		}
		advanceTour(total)
	}

	// A read step always offers Next. An action step offers it only once its
	// action is done, which is what lets someone who stepped Back move forward
	// again without redoing the thing they already did.
	const canAdvance = current.gate === "read" || gateSatisfied

	return (
		<Coachmark
			anchorRef={anchors.refs[current.anchor]}
			title={current.title}
			body={current.body}
			step={index}
			total={total}
			onNext={canAdvance ? goNext : undefined}
			onBack={index > 0 ? goBackTour : undefined}
			hint={current.hint}
			// Only ever present on a gated step, and only while its action is
			// still outstanding - the way past for someone who does not want to
			// pick anything yet.
			onSkipStep={canAdvance ? undefined : goNext}
			onSkip={finish}
		/>
	)
}
