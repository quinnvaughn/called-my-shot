import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { StartGroupModal } from "#/components/groups/start-group-modal"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"
import { SectionLabel } from "#/components/ui/section-label"
import {
	arcadeInviteGroupQuery,
	arcadeViewerGroupsQuery,
} from "#/graphql/arcade/queries"
import { watchViewerGroupsQuery } from "#/graphql/were-you-watching/queries"
import { useJoinGroupFlow } from "#/hooks/use-join-group-flow"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import type { ShareMethod } from "#/lib/share-links"
import { readArcadeInvite } from "#/stores/arcade-invite-store"
import { openModal } from "#/stores/modal-store"
import {
	ARCADE_GAME_INFO,
	type ArcadeGameKey,
	type NextStep,
} from "./arcade-game-info"
import { ArcadeGroupRow } from "./arcade-group-row"
import { NextStepCard } from "./next-step-card"

// What comes after a finished arcade game: keeping the result (an account)
// and playing it with friends (a group). The game is the way in; this is
// where it leads. Were You Watching? has a quiz per team rather than one a
// day, so its groups are counted on `watchQuizId`.
export function ArcadeNextSteps({
	game,
	watchQuizId,
	resultUrl,
	onStep,
	onShared,
}: {
	game: ArcadeGameKey
	watchQuizId?: string
	resultUrl: string
	onStep: (step: NextStep) => void
	onShared: (method: ShareMethod) => void
}) {
	const me = useMe()
	const requireAuth = useRequireAuth()
	const { joinGroup, isPending: joining } = useJoinGroupFlow()
	const surface = ARCADE_GAME_INFO[game].surface

	// Read after mount: the invite lives in session storage.
	const [inviteCode, setInviteCode] = useState<string | null>(null)
	useEffect(() => setInviteCode(readArcadeInvite()), [])

	const { data: inviteData } = useQuery({
		...arcadeInviteGroupQuery(inviteCode ?? ""),
		enabled: !!inviteCode,
	})
	const { data: groupsData } = useQuery({
		...arcadeViewerGroupsQuery,
		enabled: !!me && game !== "watch",
	})
	const { data: watchGroupsData } = useQuery({
		...watchViewerGroupsQuery(watchQuizId ?? ""),
		enabled: !!me && game === "watch" && !!watchQuizId,
	})

	const invited = inviteData?.groupPreview
	const inviteGroup = invited && !invited.viewerIsMember ? invited : null
	// Each group with its members' statuses on what was just played.
	const groups =
		game === "watch"
			? (watchGroupsData?.myGroups ?? []).map((group) => ({
					group,
					statuses: (group.watchQuizBoard?.members ?? []).map((m) => m.status),
				}))
			: (groupsData?.myGroups ?? []).map((group) => ({
					group,
					statuses: (
						match(game)
							.with("season", () => group.seasonPuzzleBoard?.today)
							.with("rank", () => group.rankBoard?.today)
							.with("chain", () => group.teammateChainBoard?.today)
							.exhaustive() ?? []
					).map((m) => m.status),
				}))
	const saveCopy =
		game === "watch"
			? {
					title: "Save your result",
					body: "Sign up and your score goes on this quiz's board. Your account also lets you call real games and compete with your friends in a group.",
				}
			: {
					title: "Save today's result",
					body: "Sign up and today counts as day one of your streak. Your account also lets you call real games and compete with your friends in a group.",
				}

	function signUp() {
		onStep("sign_up")
		openModal(
			<AuthModal
				defaultView="signup"
				surface={surface}
				copy={{
					signup: {
						title: saveCopy.title,
						description:
							game === "watch"
								? "Your score goes on this quiz's board. Your account also lets you call real games and compete with your friends."
								: "Today counts as day one of your streak. Your account also lets you call real games and compete with your friends.",
					},
				}}
			/>,
		)
	}

	function join(code: string, groupName: string) {
		onStep("join_group")
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
			{ intent: { kind: "join_group", code }, surface },
		)
	}

	function startGroup() {
		onStep("start_group")
		openModal(<StartGroupModal surface={surface} />)
	}

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "3" })}
		>
			<SectionLabel>What's next</SectionLabel>

			{!me && (
				<NextStepCard
					title={saveCopy.title}
					body={saveCopy.body}
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
					{groups.map(({ group, statuses }) => {
						return (
							<ArcadeGroupRow
								key={group.id}
								game={game}
								group={group}
								played={statuses.filter((s) => s !== "NOT_PLAYED").length}
								members={statuses.length}
								resultUrl={resultUrl}
								onShared={onShared}
								onOpened={() => onStep("group_board")}
							/>
						)
					})}
				</Card>
			) : (
				<NextStepCard
					title="Start a group for your chat"
					body="Everyone in it sees each other's results every day, and you compete on calls too."
					action={
						<Button variant="outline" onClick={startGroup}>
							Start a group
						</Button>
					}
				/>
			)}
		</div>
	)
}
