import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { FaQuestion, FaRegCheckSquare } from "react-icons/fa"
import {
	FiHelpCircle,
	FiLifeBuoy,
	FiLogOut,
	FiRefreshCw,
	FiSettings,
	FiShield,
} from "react-icons/fi"
import { css } from "styled-system/css"
import { Avatar } from "#/components/ui/avatar"
import { Dropdown } from "#/components/ui/dropdown"
import { useGqlMutation } from "#/graphql/hooks"
import { RestartOnboardingDocument } from "#/graphql/mutations/onboarding"
import { ViewerOnboardingDocument } from "#/graphql/queries/onboarding"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useSignOut } from "#/hooks/use-sign-out"
import { buildQuestionSlug } from "#/lib/slug"
import { endTour } from "#/stores/tour-store"

const onboardingQuery = gqlQueryOptions(ViewerOnboardingDocument, {})

type AccountMenuProps = {
	name: string
	username: string
	isAdmin?: boolean
	// "sidebar": full identity chip, menu opens upward (trigger sits at the
	// bottom of the nav column). "topbar": compact avatar-only trigger, menu
	// opens downward (trigger sits in the mobile top bar).
	variant?: "sidebar" | "topbar"
}

export function AccountMenu({
	name,
	username,
	isAdmin = false,
	variant = "sidebar",
}: AccountMenuProps) {
	const { signOut } = useSignOut()
	const navigate = useNavigate()
	const router = useRouter()
	const queryClient = useQueryClient()
	const restartOnboarding = useGqlMutation(RestartOnboardingDocument)

	// Starts the walkthrough outright rather than clearing the dismissal and
	// hoping the launcher comes back. It would not: the launcher also hides
	// once the viewer has made a call, so routing this through it made the menu
	// item do nothing at all for everyone past their first call - which is
	// everyone who would ever want a second look at how scoring works.
	//
	// Clearing the timestamp still matters for the case where they have not
	// called yet and dismissed the pill: it puts the standing offer back too.
	async function handleReplayWalkthrough() {
		// A tour abandoned by navigating away leaves its step index behind, and
		// "replay" that resumes at step 3 is not a replay.
		endTour()
		await restartOnboarding.mutateAsync(undefined)
		await queryClient.invalidateQueries()
		await router.invalidate()

		// suggestedFirstQuestion skips anything this viewer already called, so a
		// replay lands on a question that is genuinely still callable and the
		// coachmarks have a live form to point at.
		const data = await queryClient.fetchQuery(onboardingQuery)
		const suggested =
			data.viewerOnboarding.__typename === "ViewerOnboarding"
				? data.viewerOnboarding.suggestedQuestion
				: null

		if (!suggested) {
			await navigate({ to: "/home" })
			return
		}
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
		<Dropdown
			className={css({ width: variant === "sidebar" ? "full" : "auto" })}
		>
			{variant === "sidebar" ? (
				<Dropdown.Trigger
					aria-label="Account menu"
					className={css({
						display: "flex",
						alignItems: "center",
						width: "full",
						borderRadius: "2xl",
						justifyContent: "flex-start",
						gap: "2.5",
						padding: "2.5",
						_hover: { bg: "fg.default/10" },
					})}
				>
					<Avatar name={name} />
					<div className={css({ minWidth: 0, textAlign: "left" })}>
						<div
							className={css({
								fontSize: "sm",
								fontWeight: "medium",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							})}
						>
							{name}
						</div>
						<div
							className={css({
								fontFamily: "mono",
								fontSize: "3xs",
								color: "fg.muted",
							})}
						>
							@{username}
						</div>
					</div>
				</Dropdown.Trigger>
			) : (
				<Dropdown.Trigger aria-label="Account menu">
					<Avatar name={name} size="sm" />
				</Dropdown.Trigger>
			)}
			<Dropdown.Content
				placement={variant === "sidebar" ? "top" : "bottom"}
				className={css(variant === "sidebar" ? { width: "full" } : undefined)}
			>
				{variant === "topbar" && (
					<>
						<div className={css({ padding: "{spacing.1} {spacing.2.5}" })}>
							<div
								className={css({
									fontSize: "sm",
									fontWeight: "medium",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								{name}
							</div>
							<div
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.muted",
								})}
							>
								@{username}
							</div>
						</div>
						<div
							className={css({
								borderTop: "1px solid {colors.border.default}",
								marginBlock: "1",
							})}
						/>
					</>
				)}
				<Dropdown.Item onClick={() => navigate({ to: "/my-calls" })}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FaRegCheckSquare size={14} />
						My Calls
					</span>
				</Dropdown.Item>
				<Dropdown.Item onClick={() => navigate({ to: "/my-questions" })}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FaQuestion size={14} />
						My Questions
					</span>
				</Dropdown.Item>
				{isAdmin && (
					<Dropdown.Item onClick={() => navigate({ to: "/admin" })}>
						<span
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "2",
							})}
						>
							<FiShield size={14} />
							Admin
						</span>
					</Dropdown.Item>
				)}
				<Dropdown.Item onClick={() => navigate({ to: "/settings" })}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FiSettings size={14} />
						Settings
					</span>
				</Dropdown.Item>
				<Dropdown.Item onClick={() => navigate({ to: "/how-it-works" })}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FiHelpCircle size={14} />
						How It Works
					</span>
				</Dropdown.Item>
				{/* What makes skipping the walkthrough a free choice: it can
				    always be started again, so nobody has to sit through it the
				    first time just in case. */}
				<Dropdown.Item onClick={handleReplayWalkthrough}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FiRefreshCw size={14} />
						Replay Walkthrough
					</span>
				</Dropdown.Item>
				<Dropdown.Item onClick={() => navigate({ to: "/support" })}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FiLifeBuoy size={14} />
						Support
					</span>
				</Dropdown.Item>
				<Dropdown.Item onClick={signOut}>
					<span
						className={css({ display: "flex", alignItems: "center", gap: "2" })}
					>
						<FiLogOut size={14} />
						Log out
					</span>
				</Dropdown.Item>
			</Dropdown.Content>
		</Dropdown>
	)
}
