import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { FiCheck, FiChevronDown, FiChevronUp, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button, button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useGqlMutation } from "#/graphql/hooks"
import {
	DismissOnboardingDocument,
	SetOnboardingCollapsedDocument,
} from "#/graphql/mutations/onboarding"
import { ViewerOnboardingDocument } from "#/graphql/queries/onboarding"
import { gqlQueryOptions } from "#/graphql/query-options"
import { track } from "#/lib/analytics"
import { buildQuestionSlug } from "#/lib/slug"
import {
	completedCount,
	isOnboardingComplete,
	type OnboardingStep,
	onboardingSteps,
} from "./onboarding-steps"

const onboardingQuery = gqlQueryOptions(ViewerOnboardingDocument, {})

// The standing map of the product, for anyone who wants one.
//
// The coachmark tour explains the call form and nothing else, because that is
// all it can point at. Everything the app does beyond a single question -
// ranking, groups, posting your own - lives here instead, as a list somebody
// can read in ten seconds and then ignore. Nothing in it is a gate: it retires
// itself once the steps are done, and can be folded down to a single row in
// the meantime.
//
// Getting rid of it for good is deliberately only reachable from that
// collapsed row. This card is the one place groups and the leaderboard are
// explained at all, so a single stray click on a card most people will not
// have finished should not be able to take that away.
export function OnboardingChecklist() {
	const { me } = useRouteContext({ from: "__root__" })
	const navigate = useNavigate()
	const dismiss = useGqlMutation(DismissOnboardingDocument)
	const setCollapsed = useGqlMutation(SetOnboardingCollapsedDocument)

	// useQuery, not useSuspenseQuery: /home already suspends on its dashboard
	// loader, and the checklist is the least important thing on the page. It
	// should never be what holds up the questions locking tonight.
	const { data } = useQuery({ ...onboardingQuery, enabled: !!me })

	// Collapsing and dismissing render from local state and persist behind it.
	// Both are pure display choices that nothing else on the page reads, so
	// there is nothing to invalidate and nothing worth waiting for. Awaiting
	// the write meant a round trip before the card moved at all.
	//
	// null means "no local opinion yet, use whatever the server said".
	const serverCollapsed = !!me?.onboardingCollapsedAt
	const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(
		null,
	)
	const [dismissedLocally, setDismissedLocally] = useState(false)

	// The stored value can also change from outside this card: "Replay
	// walkthrough" clears both timestamps. That is authoritative, so a local
	// override is dropped the moment the server disagrees with where it came
	// from, rather than pinning the card shut after a replay.
	const lastServerCollapsed = useRef(serverCollapsed)
	useEffect(() => {
		if (lastServerCollapsed.current !== serverCollapsed) {
			lastServerCollapsed.current = serverCollapsed
			setCollapsedOverride(null)
		}
	}, [serverCollapsed])

	if (!me || me.onboardingDismissedAt || dismissedLocally) return null

	const onboarding =
		data?.viewerOnboarding.__typename === "ViewerOnboarding"
			? data.viewerOnboarding
			: null
	if (!onboarding) return null

	const steps = onboardingSteps({
		hasCalled: onboarding.hasCalled,
		hasGroup: onboarding.hasGroup,
		hasCreatedQuestion: onboarding.hasCreatedQuestion,
		emailVerified: me.emailVerified,
		questionCreationEnabled: me.questionCreationEnabled,
	})
	if (isOnboardingComplete(steps)) return null

	const suggested = onboarding.suggestedQuestion
	const done = completedCount(steps)

	function handleDismiss() {
		track("onboarding_dismissed", { at: "checklist", stepsComplete: done })
		setDismissedLocally(true)
		dismiss.mutate(undefined)
	}

	function handleCollapse(collapsed: boolean) {
		setCollapsedOverride(collapsed)
		setCollapsed.mutate({ collapsed })
	}

	function startFirstCall() {
		if (!suggested) return
		track("onboarding_started", { surface: "checklist" })
		navigate({
			to: "/questions/$questionId/{-$slug}",
			params: {
				questionId: suggested.id,
				slug: buildQuestionSlug(suggested.title),
			},
			search: { tour: "first-call" },
		})
	}

	// Collapsed: one row that still reports progress, so it stays a reminder
	// rather than becoming invisible. This is also the only place the permanent
	// dismiss is offered.
	if (collapsedOverride ?? serverCollapsed) {
		return (
			<Card>
				<Card.Body>
					<HStack justify="space-between" alignItems="center" gap="3">
						<button
							type="button"
							onClick={() => handleCollapse(false)}
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "2.5",
								minWidth: 0,
								cursor: "pointer",
								color: "fg.default",
								_hover: { color: "fg.default" },
							})}
						>
							<FiChevronDown size={16} />
							<span className={css({ fontFamily: "heading", fontSize: "sm" })}>
								Getting started
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "fg.muted",
									whiteSpace: "nowrap",
								})}
							>
								{done} of {steps.length} done
							</span>
						</button>
						<button
							type="button"
							aria-label="Remove getting started"
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
				</Card.Body>
			</Card>
		)
	}

	return (
		<Card>
			<Card.Body>
				<VStack gap="4" alignItems="stretch">
					<HStack justify="space-between" alignItems="flex-start" gap="3">
						<VStack gap="1" alignItems="flex-start">
							<h2
								className={css({
									fontFamily: "heading",
									fontSize: "md",
									color: "fg.default",
								})}
							>
								Getting started
							</h2>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "fg.muted",
								})}
							>
								{done} of {steps.length} done
							</span>
						</VStack>
						<button
							type="button"
							aria-label="Collapse getting started"
							onClick={() => handleCollapse(true)}
							className={css({
								display: "flex",
								flexShrink: 0,
								color: "fg.subtle",
								cursor: "pointer",
								_hover: { color: "fg.default" },
							})}
						>
							<FiChevronUp size={16} />
						</button>
					</HStack>

					<VStack gap="3" alignItems="stretch">
						{steps.map((step) => (
							<StepRow
								key={step.id}
								step={step}
								action={match(step)
									// A done step keeps its explanation but drops its
									// button. The text is the reason the row is worth
									// reading; the button is the only part that stops
									// being useful.
									.when(
										(s) => s.done || s.blockedBy !== undefined,
										() => null,
									)
									.with({ id: "call" }, () =>
										suggested ? (
											<Button size="sm" onClick={startFirstCall}>
												Walk me through it
											</Button>
										) : (
											// Honest rather than hidden: the step still
											// explains what a call is, it just has nothing
											// to point at right now.
											<span
												className={css({
													fontFamily: "mono",
													fontSize: "2xs",
													color: "fg.subtle",
												})}
											>
												Nothing open to call yet
											</span>
										),
									)
									.with({ id: "leaderboard" }, () => (
										<Link
											to="/leaderboard"
											className={button({ variant: "dark", size: "sm" })}
										>
											See the leaderboard
										</Link>
									))
									.with({ id: "group" }, () => (
										<Link
											to="/groups"
											className={button({ variant: "dark", size: "sm" })}
										>
											Start a group
										</Link>
									))
									// A link, not a button: this one hands off to a
									// page where the real action lives, the same way
									// the email bounce banner points at settings.
									.with({ id: "verify-email" }, () => (
										<Link
											to="/settings"
											className={css({
												fontSize: "xs",
												fontWeight: "medium",
												color: "fg.default",
												textDecoration: "underline",
											})}
										>
											Resend it from settings
										</Link>
									))
									.with({ id: "question" }, () => (
										<Link
											to="/new-question"
											className={button({ variant: "dark", size: "sm" })}
										>
											Post a question
										</Link>
									))
									.exhaustive()}
							/>
						))}
					</VStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}

function StepRow({
	step,
	action,
}: {
	step: OnboardingStep
	action: React.ReactNode
}) {
	return (
		<HStack gap="3" alignItems="flex-start">
			<span
				aria-hidden
				className={css({
					display: "flex",
					flexShrink: 0,
					alignItems: "center",
					justifyContent: "center",
					width: "5",
					height: "5",
					marginTop: "0.5",
					borderRadius: "full",
					border: "1px solid {colors.border.emphasized}",
					bg: step.done ? "primary.default" : "transparent",
					color: "primary.contrast",
				})}
			>
				{step.done && <FiCheck size={12} />}
			</span>
			<VStack gap="1.5" alignItems="flex-start" minWidth="0">
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "semibold",
						color: step.done ? "fg.muted" : "fg.default",
						textDecoration: step.done ? "line-through" : "none",
					})}
				>
					{step.title}
				</span>
				<p
					className={css({
						fontSize: "xs",
						lineHeight: "relaxed",
						color: "fg.muted",
					})}
				>
					{step.body}
				</p>
				{step.blockedBy && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						Verify your email first
					</span>
				)}
				{action}
			</VStack>
		</HStack>
	)
}
