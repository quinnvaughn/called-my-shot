import { useQuery } from "@tanstack/react-query"
import {
	useNavigate,
	useRouteContext,
	useRouterState,
} from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { useGqlMutation } from "#/graphql/hooks"
import { DismissOnboardingDocument } from "#/graphql/mutations/onboarding"
import { ViewerOnboardingDocument } from "#/graphql/queries/onboarding"
import { gqlQueryOptions } from "#/graphql/query-options"
import { track } from "#/lib/analytics"
import { buildQuestionSlug } from "#/lib/slug"
import { tourStepStore } from "#/stores/tour-store"

const onboardingQuery = gqlQueryOptions(ViewerOnboardingDocument, {})

// The walkthrough's entry point: a pill floating in the corner of every page
// inside the app shell.
//
// It floats over the content rather than sitting in the layout so it is
// present wherever someone happens to land, and it is deliberately NOT a
// modal. Nothing is blocked while it is up - you can scroll, click a league,
// make a call, and never acknowledge it. That is the whole point: an intro
// that interrupts gets dismissed reflexively, an offer that just sits there
// can be taken whenever someone actually wants it.
export function WalkthroughLauncher() {
	const { me } = useRouteContext({ from: "__root__" })
	const navigate = useNavigate()
	const dismiss = useGqlMutation(DismissOnboardingDocument)
	const [dismissedLocally, setDismissedLocally] = useState(false)
	// Hidden while the coachmarks are running, since it points at the thing
	// already happening and would sit on top of the form being explained.
	const tourRunning = useStore(tourStepStore, (s) => s !== null)
	// /home carries the get-started checklist, whose first row is this same
	// offer with the rest of the product around it. Two prompts for one action
	// on one page is just clutter, so the pill stands down where the fuller
	// version already is.
	const onHome = useRouterState({
		select: (s) => s.location.pathname === "/home",
	})

	const { data } = useQuery({ ...onboardingQuery, enabled: !!me })

	if (
		!me ||
		me.onboardingDismissedAt ||
		dismissedLocally ||
		tourRunning ||
		onHome
	) {
		return null
	}

	const onboarding =
		data?.viewerOnboarding.__typename === "ViewerOnboarding"
			? data.viewerOnboarding
			: null
	if (!onboarding) return null

	// Someone who has made a call has done the thing the walkthrough exists to
	// explain. Leaving the offer up after that is nagging.
	if (onboarding.hasCalled) return null

	const suggested = onboarding.suggestedQuestion
	if (!suggested) return null

	// Goes away on the click and persists behind it. Nothing else on the page
	// reads the dismissal, so waiting on the write (and on a refetch of every
	// query, which is what a bare invalidateQueries does) bought nothing but
	// lag on the one gesture that should feel instant.
	function handleDismiss() {
		track("onboarding_dismissed", { at: "launcher", stepsComplete: 0 })
		setDismissedLocally(true)
		dismiss.mutate(undefined)
	}

	async function handleStart() {
		if (!suggested) return
		track("onboarding_started", { surface: "launcher" })
		await navigate({
			to: "/questions/$questionId/{-$slug}",
			params: {
				questionId: suggested.id,
				slug: buildQuestionSlug(suggested.title),
			},
			search: { tour: "first-call" },
		})
	}

	return (
		<div
			className={css({
				position: "fixed",
				zIndex: "launcher",
				bottom: "5",
				// Corner on desktop, a bar across the bottom on mobile where
				// there is no corner to spare.
				right: { base: "4", md: "6" },
				left: { base: "4", md: "auto" },
				width: { base: "auto", md: "sm" },
				backgroundColor: "bg.surface",
				border: "1px solid {colors.border.emphasized}",
				borderRadius: "xl",
				padding: "4",
				boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
			})}
		>
			<HStack gap="3" alignItems="flex-start" justify="space-between">
				<VStack gap="2.5" alignItems="flex-start" minWidth="0">
					<VStack gap="1" alignItems="flex-start">
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "sm",
								color: "fg.default",
							})}
						>
							New here?
						</span>
						<span
							className={css({
								fontSize: "xs",
								lineHeight: "relaxed",
								color: "fg.muted",
							})}
						>
							Walk through making a call on {suggested.title}
						</span>
					</VStack>
					<Button size="sm" variant="solid" onClick={handleStart}>
						Show me how
					</Button>
				</VStack>
				<button
					type="button"
					aria-label="Dismiss walkthrough"
					onClick={handleDismiss}
					className={css({
						display: "flex",
						flexShrink: 0,
						color: "fg.subtle",
						cursor: "pointer",
						_hover: { color: "fg.default" },
					})}
				>
					<FiX size={16} />
				</button>
			</HStack>
		</div>
	)
}
