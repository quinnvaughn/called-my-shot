import { useStore } from "@tanstack/react-store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { ChipButton } from "#/components/ui/chip-button"
import type { FragmentType } from "#/graphql/generated"
import { track } from "#/lib/analytics"
import { toCallShape } from "#/lib/question-labels"
import {
	type GuestPick,
	guestPicksStore,
	removeGuestPick,
	restoreGuestPicks,
	setGuestPick,
} from "#/stores/guest-picks-store"
import { GuestPickCard, type GuestPickCardFragment } from "./guest-pick-card"
import { GuestPicksEmpty } from "./guest-picks-empty"
import { GuestPicksLockBar } from "./guest-picks-lock-bar"
import { lockInLabel, openGuestPicksAuth } from "./open-guest-picks-auth"
import {
	type GuestPickCandidate,
	guestPickGames,
	guestPickLeagues,
} from "./select-guest-picks"

type Candidate = GuestPickCandidate & FragmentType<typeof GuestPickCardFragment>

type Props = {
	questions: Candidate[]
}

// The landing page's hero: one real game a visitor can call before they have
// an account. Who wins comes first, then each team's total, or the next games'
// winners where there are no totals yet (see select-guest-picks.ts). Picks are held in guest-picks-store and posted from
// Home once they sign up or sign in (see lib/submit-guest-picks.ts).
//
// One call is a complete try. Tapping an option leaves the card up with the
// crowd split and the ask to sign up underneath, rather than moving on to the
// next card: the job here is getting a visitor to make a call, and a call
// they've just made is the best reason they'll have to sign up. The game's
// other cards are there for anyone who wants another, a tap away.
//
// The stack is scoped to one league at a time. A visitor who only watches one
// sport shouldn't have to skip past others to reach a game they have an
// opinion on.
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
	const games = useMemo(
		() => guestPickGames(questions, now, leagueId),
		[questions, now, leagueId],
	)
	// Seeded rather than left empty for the effect below to fill: an empty first
	// render reads as nothing to call, which would flash the empty state through
	// hydration before the real card arrived.
	const [gameId, setGameId] = useState<string | null>(
		() => games[0]?.id ?? null,
	)
	const [step, setStep] = useState(0)
	const skippedGames = useRef(new Set<string>())
	const restored = useRef(false)
	const stackRef = useRef<HTMLDivElement>(null)
	const picks = useStore(guestPicksStore, (state) => state)

	// Every card in every game on offer, whichever league it's in.
	const offeredIds = useMemo(
		() => new Set(games.flatMap((g) => g.cards.map((q) => q.id))),
		[games],
	)

	// Moves the stack to the card holding a question, selecting its league.
	const showCard = useCallback(
		(questionId: string) => {
			const game = games.find((g) => g.cards.some((q) => q.id === questionId))
			if (!game) return
			setLeagueId(game.league.id)
			setGameId(game.id)
			setStep(game.cards.findIndex((q) => q.id === questionId))
		},
		[games],
	)

	// Runs once, after the first render. localStorage can't be read on the
	// server or through hydration, so the stack starts from whatever the page
	// rendered with and is moved here to the last call this visitor made, with
	// its league selected and the ask to lock it in underneath.
	useEffect(() => {
		if (restored.current) return
		restored.current = true
		const last = restoreGuestPicks(offeredIds).at(-1)
		if (last) showCard(last.questionId)
	}, [offeredIds, showCard])

	const pickFor = (questionId: string) =>
		picks.find((p) => p.questionId === questionId)?.optionId ?? null

	// Everything called across every game and league, not just the one on
	// screen: a visitor who called an NFL game and then switched to the NBA chip
	// signs up to lock in both, and submit-guest-picks posts both.
	const madePicks = picks.filter((p) => offeredIds.has(p.questionId))
	const calledIds = new Set(madePicks.map((p) => p.questionId))

	// Where the stack goes once there's nothing new left to offer: back to the
	// last call waiting, since that's still something to sign up for.
	function showLastPick() {
		const last = madePicks.at(-1)
		if (last) showCard(last.questionId)
		else setGameId(null)
	}

	// A chip swaps the game on screen for that league's soonest one the visitor
	// hasn't called the winner of. Calls already made stay made, whichever sport
	// they were in.
	function selectLeague(nextLeagueId: string) {
		if (nextLeagueId === leagueId) return
		track("guest_picks_league_selected", { leagueId: nextLeagueId })
		setLeagueId(nextLeagueId)
		skippedGames.current = new Set()
		const inLeague = games.filter((g) => g.league.id === nextLeagueId)
		const next =
			inLeague.find((g) => !calledIds.has(g.cards[0].id)) ?? inLeague[0]
		if (!next) return
		setGameId(next.id)
		setStep(0)
	}

	function handlePick(pick: GuestPick) {
		setGuestPick(pick)
		track("guest_pick_made", {
			questionId: pick.questionId,
			questionShape: toCallShape(pick.shape),
			leagueId: pick.leagueId,
			index: step,
		})
	}

	function handleSkip() {
		if (!game || !card) return
		removeGuestPick(card.id)
		track("guest_pick_skipped", {
			questionId: card.id,
			questionShape: toCallShape(card.shape),
			leagueId: card.league.id,
		})
		if (step > 0) {
			if (step + 1 < game.cards.length) setStep(step + 1)
			else showLastPick()
			return
		}
		// Skipping who wins skips the game. games leads with the selected
		// league, so the replacement comes from the same slate until it runs
		// out: this game was no good, not the sport.
		skippedGames.current.add(game.id)
		const next = games.find(
			(g) => !skippedGames.current.has(g.id) && !calledIds.has(g.cards[0].id),
		)
		if (next) {
			setGameId(next.id)
			setStep(0)
		} else {
			showLastPick()
		}
	}

	const game = games.find((g) => g.id === gameId)
	const card = game?.cards[step]
	const pickCount = madePicks.length

	return (
		<>
			<div ref={stackRef}>
				{game && card ? (
					<VStack gap="4" alignItems="stretch">
						<VStack gap="1" alignItems="flex-start">
							<h2
								className={css({
									fontFamily: "heading",
									fontSize: { base: "xl", lg: "2xl" },
									lineHeight: "tight",
								})}
							>
								Make a call
							</h2>
							<p className={css({ fontSize: "sm", color: "fg.muted" })}>
								No account needed. Sign up after and it counts.
							</p>
						</VStack>
						{/* Only worth a row when there's somewhere else to go. One league
						    with games up means the stack is already all of it. */}
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
							key={card.id}
							question={card}
							pickedOptionId={pickFor(card.id)}
							onPick={handlePick}
						/>
						{pickFor(card.id) !== null && (
							<VStack gap="1.5" alignItems="stretch">
								<Button
									variant="solid"
									size="md"
									fullWidth
									onClick={() =>
										openGuestPicksAuth("signup", pickCount, "card")
									}
								>
									{lockInLabel(pickCount)}
								</Button>
								<p
									className={css({
										fontSize: "xs",
										color: "fg.muted",
										textAlign: "center",
									})}
								>
									{pickCount === 1
										? "It only counts if you sign up before it locks."
										: "Calls only count if you sign up before they lock."}
								</p>
							</VStack>
						)}
						<HStack justify="space-between" alignItems="center" gap="3">
							<Button
								variant="ghost"
								size="md"
								onClick={() => setStep((s) => Math.max(0, s - 1))}
								className={css({
									visibility: step === 0 ? "hidden" : "visible",
								})}
							>
								<FiChevronLeft />
								Back
							</Button>
							{/* A card that already has a pick moves on keeping it. Skip
							    would throw the pick away. */}
							{pickFor(card.id) === null ? (
								<Button variant="ghost" size="md" onClick={handleSkip}>
									Skip this one
									<FiChevronRight />
								</Button>
							) : (
								step + 1 < game.cards.length && (
									<Button
										variant="ghost"
										size="md"
										onClick={() => setStep((s) => s + 1)}
									>
										Make another call
										<FiChevronRight />
									</Button>
								)
							)}
						</HStack>
					</VStack>
				) : (
					<GuestPicksEmpty />
				)}
			</div>
			<GuestPicksLockBar stackRef={stackRef} pickCount={pickCount} />
		</>
	)
}
