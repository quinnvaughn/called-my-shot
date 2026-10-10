import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { Fragment, useState } from "react"
import { FaQuestion } from "react-icons/fa"
import {
	FiChevronDown,
	FiChevronUp,
	FiFileText,
	FiHelpCircle,
	FiLifeBuoy,
	FiLock,
	FiRefreshCw,
	FiSettings,
	FiShield,
	FiUserPlus,
	FiZap,
} from "react-icons/fi"
import { HiDotsCircleHorizontal } from "react-icons/hi"
import type { IconType } from "react-icons/lib"
import { css } from "styled-system/css"
import { Dropdown } from "#/components/ui/dropdown"
import { useGqlMutation } from "#/graphql/hooks"
import { RestartOnboardingDocument } from "#/graphql/mutations/onboarding"
import { ViewerOnboardingDocument } from "#/graphql/queries/onboarding"
import { gqlQueryOptions } from "#/graphql/query-options"
import { buildQuestionSlug } from "#/lib/slug"
import { endTour } from "#/stores/tour-store"

const onboardingQuery = gqlQueryOptions(ViewerOnboardingDocument, {})

type MoreMenuProps = {
	signedIn: boolean
	isAdmin: boolean
	// Closes the mobile drawer the menu lives in once an item is picked.
	onNavigate: () => void
}

export function MoreMenu({ signedIn, isAdmin, onNavigate }: MoreMenuProps) {
	const navigate = useNavigate()
	const router = useRouter()
	const queryClient = useQueryClient()
	const restartOnboarding = useGqlMutation(RestartOnboardingDocument)
	const [expanded, setExpanded] = useState(false)

	function go(to: string) {
		onNavigate()
		void navigate({ to })
	}

	// Starts the walkthrough outright rather than clearing the dismissal and
	// hoping the launcher comes back. It would not: the launcher also hides
	// once the viewer has made a call, so routing this through it made the menu
	// item do nothing at all for everyone past their first call - which is
	// everyone who would ever want a second look at how scoring works.
	//
	// Clearing the timestamp still matters for the case where they have not
	// called yet and dismissed the pill: it puts the standing offer back too.
	async function handleReplayWalkthrough() {
		onNavigate()
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

	type Item = {
		label: string
		icon: IconType
		onSelect: () => void
		// Starts a new group, drawn with a divider above it.
		groupStart?: boolean
	}
	const items: Item[] = [
		...(signedIn
			? [
					{
						label: "My Questions",
						icon: FaQuestion,
						onSelect: () => go("/my-questions"),
					},
					{
						label: "Invite a Friend",
						icon: FiUserPlus,
						onSelect: () => go("/invite"),
					},
					...(isAdmin
						? [{ label: "Admin", icon: FiShield, onSelect: () => go("/admin") }]
						: []),
					{
						label: "Settings",
						icon: FiSettings,
						onSelect: () => go("/settings"),
					},
				]
			: []),
		{
			label: "How It Works",
			icon: FiHelpCircle,
			onSelect: () => go("/how-it-works"),
		},
		{
			label: "Updates",
			icon: FiZap,
			onSelect: () => go("/updates"),
		},
		// What makes skipping the walkthrough a free choice: it can always be
		// started again, so nobody has to sit through it the first time just in
		// case.
		...(signedIn
			? [
					{
						label: "Replay Walkthrough",
						icon: FiRefreshCw,
						onSelect: handleReplayWalkthrough,
					},
					{
						label: "Support",
						icon: FiLifeBuoy,
						onSelect: () => go("/support"),
					},
				]
			: []),
		{
			label: "Terms",
			icon: FiFileText,
			onSelect: () => go("/terms"),
			groupStart: true,
		},
		{ label: "Privacy", icon: FiLock, onSelect: () => go("/privacy") },
	]

	return (
		<>
			<Dropdown
				className={css({
					width: "full",
					display: { base: "none", md: "block" },
				})}
			>
				<Dropdown.Trigger aria-label="More" className={rowClass}>
					<HiDotsCircleHorizontal size={20} />
					More
				</Dropdown.Trigger>
				<Dropdown.Content placement="bottom" className={css({ width: "full" })}>
					{items.map((item) => (
						<Fragment key={item.label}>
							{item.groupStart && (
								<div
									className={css({
										borderTop: "1px solid {colors.border.default}",
										marginBlock: "1",
									})}
								/>
							)}
							<Dropdown.Item onClick={item.onSelect}>
								<span
									className={css({
										display: "flex",
										alignItems: "center",
										gap: "2",
									})}
								>
									<item.icon size={14} />
									{item.label}
								</span>
							</Dropdown.Item>
						</Fragment>
					))}
				</Dropdown.Content>
			</Dropdown>

			{/* The drawer is already a list of rows, so More just extends it
			    rather than opening a menu on top of a menu. */}
			<div
				className={css({
					display: { base: "flex", md: "none" },
					flexDirection: "column",
					gap: "1",
				})}
			>
				<button
					type="button"
					aria-expanded={expanded}
					onClick={() => setExpanded((open) => !open)}
					className={rowClass}
				>
					<HiDotsCircleHorizontal size={20} />
					More
					<span className={css({ marginLeft: "auto", display: "flex" })}>
						{expanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
					</span>
				</button>
				{expanded &&
					items.map((item) => (
						<button
							key={item.label}
							type="button"
							onClick={item.onSelect}
							className={rowClass}
						>
							<item.icon size={20} />
							{item.label}
						</button>
					))}
			</div>
		</>
	)
}

// Matches the sidebar's nav links so More and its rows read as part of the
// same list.
const rowClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "flex-start",
	gap: "3.5",
	width: "full",
	padding: "{spacing.2.5} {spacing.3}",
	borderRadius: "xl",
	fontSize: "sm",
	color: "fg.subtle",
	fontWeight: "medium",
	cursor: "pointer",
	_hover: { bg: "fg.default/10", color: "fg.default" },
})
