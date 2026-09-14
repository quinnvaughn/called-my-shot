import { useStore } from "@tanstack/react-store"
import { useEffect, useRef, useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import type { FragmentType } from "#/graphql/generated"
import { track } from "#/lib/analytics"
import {
	type GuestPick,
	guestPicksStore,
	removeGuestPick,
	restoreGuestPicks,
	setGuestPick,
} from "#/stores/guest-picks-store"
import { openModal } from "#/stores/modal-store"
import { GuestPickCard, type GuestPickCardFragment } from "./guest-pick-card"
import { GuestPicksSummary } from "./guest-picks-summary"
import {
	GUEST_PICK_COUNT,
	type GuestPickCandidate,
	orderGuestPicks,
} from "./select-guest-picks"

type Candidate = GuestPickCandidate &
	FragmentType<typeof GuestPickCardFragment>

type Props = {
	questions: Candidate[]
}

// Long enough to see the pick land on the button before the next card
// replaces it.
const ADVANCE_DELAY_MS = 350

const dotBaseClass = css({
	width: "2.5",
	height: "2.5",
	borderRadius: "full",
})
const dotPickedClass = css({
	backgroundColor: "primary.default",
	border: "1px solid {colors.primary.default}",
})
const dotCurrentClass = css({
	backgroundColor: "transparent",
	border: "2px solid {colors.primary.default}",
})
const dotIdleClass = css({
	backgroundColor: "transparent",
	border: "2px solid {colors.border.emphasized}",
})

// The landing page's hero: a few real questions a visitor can call before they
// have an account. Picks are held in guest-picks-store and posted from Home once
// they sign up or sign in (see lib/submit-guest-picks.ts).
export function GuestPicks({ questions }: Props) {
	const [ordered] = useState(() => orderGuestPicks(questions, Date.now()))
	const [slots, setSlots] = useState(() =>
		ordered.slice(0, GUEST_PICK_COUNT).map((q) => q.id),
	)
	const [step, setStep] = useState(0)
	const skipped = useRef(new Set<string>())
	const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const picks = useStore(guestPicksStore, (state) => state)

	// Picks from an earlier visit lead the stack, and the visitor lands on the
	// first card they haven't called yet (or straight on the summary).
	useEffect(() => {
		const offered = new Set(ordered.map((q) => q.id))
		const restoredIds = restoreGuestPicks(offered).map((p) => p.questionId)
		if (restoredIds.length === 0) return
		const fill = ordered
			.map((q) => q.id)
			.filter((id) => !restoredIds.includes(id))
		const nextSlots = [...restoredIds, ...fill].slice(0, GUEST_PICK_COUNT)
		setSlots(nextSlots)
		setStep(Math.min(restoredIds.length, nextSlots.length))
	}, [ordered])

	useEffect(
		() => () => {
			if (advanceTimer.current) clearTimeout(advanceTimer.current)
		},
		[],
	)

	const pickFor = (questionId: string) =>
		picks.find((p) => p.questionId === questionId)?.optionId ?? null

	const slotQuestions = slots
		.map((id) => ordered.find((q) => q.id === id))
		.filter((q): q is Candidate => q !== undefined)
	const slotPicks = slots
		.map((id) => picks.find((p) => p.questionId === id))
		.filter((p): p is GuestPick => p !== undefined)

	function handlePick(pick: GuestPick) {
		if (advanceTimer.current) return
		setGuestPick(pick)
		track("guest_pick_made", {
			questionId: pick.questionId,
			questionShape: pick.shape.toLowerCase() as QuestionCallShape,
			index: step,
		})
		advanceTimer.current = setTimeout(() => {
			advanceTimer.current = null
			setStep((s) => s + 1)
		}, ADVANCE_DELAY_MS)
	}

	function handleSkip() {
		const current = slots[step]
		if (!current || advanceTimer.current) return
		skipped.current.add(current)
		removeGuestPick(current)
		track("guest_pick_skipped", { questionId: current })
		const replacement = ordered.find(
			(q) => !slots.includes(q.id) && !skipped.current.has(q.id),
		)
		setSlots(
			replacement
				? slots.map((id) => (id === current ? replacement.id : id))
				: slots.filter((id) => id !== current),
		)
	}

	if (step >= slotQuestions.length) {
		return slotPicks.length > 0 ? (
			<GuestPicksSummary picks={slotPicks} onChangePicks={() => setStep(0)} />
		) : (
			<GuestPicksEmpty />
		)
	}

	const current = slotQuestions[step]
	const total = slotQuestions.length

	return (
		<VStack gap="4" alignItems="stretch">
			<HStack justify="space-between" alignItems="flex-end" gap="4">
				<VStack gap="1" alignItems="flex-start">
					<h2
						className={css({
							fontFamily: "heading",
							fontSize: { base: "xl", lg: "2xl" },
							lineHeight: "tight",
						})}
					>
						Try it: make {total} {total === 1 ? "call" : "calls"}
					</h2>
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						No account needed. Sign up after and they count.
					</p>
				</VStack>
				<VStack gap="1.5" alignItems="flex-end" flexShrink="0">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							color: "fg.default",
						})}
					>
						{step + 1} of {total}
					</span>
					<HStack gap="1.5" alignItems="center">
						{slotQuestions.map((q, index) => (
							<span
								key={q.id}
								className={cx(
									dotBaseClass,
									pickFor(q.id) !== null
										? dotPickedClass
										: index === step
											? dotCurrentClass
											: dotIdleClass,
								)}
							/>
						))}
					</HStack>
				</VStack>
			</HStack>
			<GuestPickCard
				key={current.id}
				question={current}
				pickedOptionId={pickFor(current.id)}
				onPick={handlePick}
			/>
			<HStack justify="space-between" alignItems="center" gap="3">
				<Button
					variant="ghost"
					size="md"
					onClick={() => setStep((s) => Math.max(0, s - 1))}
					className={css({ visibility: step === 0 ? "hidden" : "visible" })}
				>
					<FiChevronLeft />
					Back
				</Button>
				{/* A card that already has a pick (reached with Back or Change
				    picks) moves on keeping it. Skip would throw the pick away. */}
				{pickFor(current.id) !== null ? (
					<Button
						variant="solid"
						size="md"
						onClick={() => {
							if (!advanceTimer.current) setStep((s) => s + 1)
						}}
					>
						{step + 1 === total ? "Review picks" : "Next"}
						<FiChevronRight />
					</Button>
				) : (
					<Button variant="ghost" size="md" onClick={handleSkip}>
						Skip this one
						<FiChevronRight />
					</Button>
				)}
			</HStack>
		</VStack>
	)
}

// Nothing official is locking soon enough to offer, or the visitor skipped past
// everything there was.
function GuestPicksEmpty() {
	return (
		<Card variant="surface" size="lg">
			<Card.Body>
				<VStack gap="4" alignItems="flex-start">
					<Eyebrow>Next slate</Eyebrow>
					<h2
						className={css({
							fontFamily: "heading",
							fontSize: "xl",
							lineHeight: "snug",
						})}
					>
						Nothing is about to lock right now.
					</h2>
					<p
						className={css({
							fontSize: "sm",
							lineHeight: "relaxed",
							color: "fg.muted",
						})}
					>
						Questions go up ahead of every game, and calling early scores more.
						Sign up and you'll be ready when the next ones post.
					</p>
					<Button
						variant="solid"
						size="lg"
						onClick={() => openModal(<AuthModal defaultView="signup" />)}
					>
						Sign up free
					</Button>
				</VStack>
			</Card.Body>
		</Card>
	)
}
