import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { css } from "styled-system/css"
import { AuthModal } from "#/components/auth/auth-modal"
import { StartGroupModal } from "#/components/landing-page/start-group-modal"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"
import { SectionLabel } from "#/components/ui/section-label"
import {
	seasonInviteGroupQuery,
	seasonViewerGroupsQuery,
} from "#/graphql/season-puzzles/queries"
import { useJoinGroupFlow } from "#/hooks/use-join-group-flow"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { track } from "#/lib/analytics"
import { openModal } from "#/stores/modal-store"
import { readSeasonInvite } from "#/stores/season-puzzle-store"
import { NextStepCard } from "./next-step-card"
import { SeasonGroupTodayRow } from "./season-group-today-row"

// What comes after a finished game: keeping the result (an account) and
// playing it with friends (a group). The game is the way in; this is where
// it leads.
export function SeasonNextSteps({
	date,
	resultUrl,
}: {
	date: string
	resultUrl: string
}) {
	const me = useMe()
	const requireAuth = useRequireAuth()
	const { joinGroup, isPending: joining } = useJoinGroupFlow()

	// Read after mount: the invite lives in session storage.
	const [inviteCode, setInviteCode] = useState<string | null>(null)
	useEffect(() => setInviteCode(readSeasonInvite()), [])

	const { data: inviteData } = useQuery({
		...seasonInviteGroupQuery(inviteCode ?? ""),
		enabled: !!inviteCode,
	})
	const { data: groupsData } = useQuery({
		...seasonViewerGroupsQuery,
		enabled: !!me,
	})

	const invited = inviteData?.groupPreview
	const inviteGroup = invited && !invited.viewerIsMember ? invited : null
	const groups = groupsData?.myGroups ?? []

	function signUp() {
		track("season_next_step_clicked", { step: "sign_up" })
		openModal(
			<AuthModal
				defaultView="signup"
				surface="season_puzzle"
				copy={{
					signup: {
						title: "Save today's result",
						description:
							"Today counts as day one of your streak. Your account also lets you call real games and compete with your friends.",
					},
				}}
			/>,
		)
	}

	function join(code: string, groupName: string) {
		track("season_next_step_clicked", { step: "join_group" })
		requireAuth(
			() => {
				void joinGroup(code)
			},
			{
				signup: {
					title: `Sign up to join ${groupName}`,
					description: "Your result today comes with you.",
				},
				signin: { title: `Sign in to join ${groupName}` },
			},
			{ intent: { kind: "join_group", code }, surface: "season_puzzle" },
		)
	}

	function startGroup() {
		track("season_next_step_clicked", { step: "start_group" })
		openModal(<StartGroupModal surface="season_puzzle" />)
	}

	const startGroupCard = (
		<NextStepCard
			title="Start a group for your chat"
			body="Everyone in it sees each other's results every day, and you compete on calls too."
			action={
				<Button variant="outline" onClick={startGroup}>
					Start a group
				</Button>
			}
		/>
	)

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "3" })}
		>
			<SectionLabel>What's next</SectionLabel>

			{!me && (
				<NextStepCard
					title="Save today's result"
					body="Sign up and today counts as day one of your streak. Your account also lets you call real games and compete with your friends in a group."
					action={
						<Button variant="solid" onClick={signUp}>
							Sign up
						</Button>
					}
				/>
			)}

			{inviteGroup && inviteCode ? (
				<NextStepCard
					leading={
						<GroupLogo
							name={inviteGroup.name}
							src={inviteGroup.logoUrl}
							size="md"
						/>
					}
					title={`Join ${inviteGroup.name}`}
					body="See everyone's results today and compete on calls."
					action={
						<Button
							variant="solid"
							loading={joining}
							onClick={() => join(inviteCode, inviteGroup.name)}
						>
							Join
						</Button>
					}
				/>
			) : me && groups.length > 0 ? (
				<Card>
					<div
						className={css({
							padding: "{spacing.3} {spacing.4}",
							borderBottom: "1px solid {colors.border.default}",
							textStyle: "label",
							color: "fg.muted",
						})}
					>
						Your groups
					</div>
					{groups.map((group) => (
						<SeasonGroupTodayRow
							key={group.id}
							group={group}
							date={date}
							resultUrl={resultUrl}
						/>
					))}
				</Card>
			) : (
				startGroupCard
			)}
		</div>
	)
}
