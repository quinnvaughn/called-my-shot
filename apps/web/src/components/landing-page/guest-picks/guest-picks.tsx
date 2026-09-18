import { useStore } from "@tanstack/react-store"
import { useEffect, useMemo, useRef, useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { ChipButton } from "#/components/ui/chip-button"
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
	guestPickLeagues,
	orderGuestPicks,
	refillSlots,
} from "./select-guest-picks"

type Candidate = GuestPickCandidate & FragmentType<typeof GuestPickCardFragment>

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
//
// The stack is scoped to one league at a time. A visitor who only watches one
// sport shouldn't have to skip past two others to reach a card they have an
// opinion on, which is what a stack that took turns by league guaranteed.
export function GuestPicks({ questions }: Props) {
	// Frozen at mount so the ordering doesn't shift under the visitor as the
	// clock crosses a question's cutoff mid-stack.
	const [now] = useState(() => Date.now())
	const leagues = useMemo(
		() => guestPickLeagues(questions, now),
		[questions, now],
	)
	const [leagueId, setLeagueId] = useState<string | null>(
		() => leagues[0]?.id ?? null,
	)
	const ordered = useMemo(
		() => orderGuestPicks(questions, now, leagueId),
		[questions, now, leagueId],
	)
	// Seeded rather than left empty for the effect below to fill: an empty first
	// render is an exhausted stack, which would flash the summary through
	// hydration before the real cards arrived.
	const [slots, setSlots] = useState<string[]>(() =>
		ordered.slice(0, GUEST_PICK_COUNT).map((q) => q.id),
	)
	const [step, setStep] = useState(0)
	const skipped = useRef(new Set<string>())
	const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const restored = useRef(false)
	const picks = useStore(guestPicksStore, (state) => state)

	// Runs once, after the first render. localStorage can't be read on the
	// server or through hydration, so the stack starts from whatever the page
	// rendered with and is rebuilt here out of what this visitor already
	// called: their calls lead it in the order they were made and they land on
	// the first card they haven't answered. Their sport leads the chips too,
	// rather than whichever league happens to lock soonest today.
	//
	// Deliberately the only effect that touches step. A league switch is a
	// deliberate act on a stack the visitor is already in the middle of, so it
	// is handled in selectLeague where it can leave them where they are.
	useEffect(() => {
		if (restored.current) return
		restored.current = true
		const offered = new Set(ordered.map((q) => q.id))
		const priorPicks = restoreGuestPicks(offered)
		const priorLeague = priorPicks.find((pick) =>
			leagues.some((league) => league.id === pick.leagueId),
		)?.leagueId
		if (priorLeague) setLeagueId(priorLeague)
		if (priorPicks.length === 0) return

		const called = priorPicks.map((pick) => pick.questionId)
		const fill = orderGuestPicks(questions, now, priorLeague ?? leagueId)
			.map((q) => q.id)
			.filter((id) => !called.includes(id))
		const nextSlots = [...called, ...fill].slice(0, GUEST_PICK_COUNT)
		setSlots(nextSlots)
		setStep(Math.min(called.length, nextSlots.length))
	}, [ordered, leagues, questions, now, leagueId])

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
	// Everything called across every league, not just what's in the current
	// slots: a visitor who called an NFL card and then switched to the NBA chip
	// signs up to lock in both, and submit-guest-picks posts both.
	const offeredIds = new Set(ordered.map((q) => q.id))
	const madePicks = picks.filter((p) => offeredIds.has(p.questionId))

	// A chip means "the card in front of me should be from this sport", not
	// "start the stack over in this sport". It refills the slot on screen plus
	// every later one still uncalled, and leaves the visitor on the same step.
	//
	// Calls already made behind them keep their slots whatever league each came
	// from: GUEST_PICK_COUNT is a total, so the chips change what's left to do
	// and never the record. The one call a chip does discard is a call sitting
	// in the slot on screen, which is the only way to move a pick to another
	// sport once all three are made and the visitor has come back through
	// Change picks.
	function selectLeague(nextLeagueId: string) {
		if (nextLeagueId === leagueId || advanceTimer.current) return
		track("guest_picks_league_selected", { leagueId: nextLeagueId })
		setLeagueId(nextLeagueId)
		skipped.current = new Set()

		const called = new Set(picks.map((pick) => pick.questionId))
		const replacements = orderGuestPicks(questions, now, nextLeagueId)
			.filter((q) => !called.has(q.id) && !slots.includes(q.id))
			.map((q) => q.id)
		const nextSlots = refillSlots(slots, step, called, replacements)
		if (nextSlots[step] !== slots[step]) removeGuestPick(slots[step])
		setSlots(nextSlots)
	}

	function handlePick(pick: GuestPick) {
		if (advanceTimer.current) return
		setGuestPick(pick)
		track("guest_pick_made", {
			questionId: pick.questionId,
			questionShape: pick.shape.toLowerCase() as QuestionCallShape,
			leagueId: pick.leagueId,
			index: step,
		})
		advanceTimer.current = setTimeout(() => {
			advanceTimer.current = null
			setStep((s) => s + 1)
		}, ADVANCE_DELAY_MS)
	}

	function handleSkip() {
		const question = slotQuestions.find((q) => q.id === slots[step])
		if (!question || advanceTimer.current) return
		skipped.current.add(question.id)
		removeGuestPick(question.id)
		track("guest_pick_skipped", {
			questionId: question.id,
			questionShape: question.shape.toLowerCase() as QuestionCallShape,
			leagueId: question.league.id,
		})
		// ordered leads with the selected league, so the replacement comes from
		// the same slate until it runs out. Skipping a question means this one
		// was no good, not that the sport was.
		const replacement = ordered.find(
			(q) => !slots.includes(q.id) && !skipped.current.has(q.id),
		)
		setSlots(
			replacement
				? slots.map((id) => (id === question.id ? replacement.id : id))
				: slots.filter((id) => id !== question.id),
		)
	}

	if (ordered.length === 0) return <GuestPicksEmpty />

	if (step >= slotQuestions.length) {
		return madePicks.length > 0 ? (
			<GuestPicksSummary picks={madePicks} onChangePicks={() => setStep(0)} />
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
						{/* No sport in the ask. The three can come from three
						    different ones, and the chip row below already says
						    which the card on screen belongs to. */}
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
			{/* Only worth a row when there's somewhere else to go. One league
			    with questions up means the stack is already all of it. */}
			{leagues.length > 1 && (
				<HStack gap="2" flexWrap="wrap" alignItems="center">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.subtle",
						})}
					>
						Your sport
					</span>
					{leagues.map((league) => (
						<ChipButton
							key={league.id}
							selected={league.id === leagueId}
							pressed={league.id === leagueId}
							onClick={() => selectLeague(league.id)}
						>
							{league.abbreviation}
						</ChipButton>
					))}
				</HStack>
			)}
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
