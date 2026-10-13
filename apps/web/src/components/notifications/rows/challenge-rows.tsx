import { useRouteContext } from "@tanstack/react-router"
import { FiFlag, FiUsers } from "react-icons/fi"
import { css } from "styled-system/css"
import { outcomeForSide } from "#/components/challenges/matchup-list"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { recordLine } from "#/lib/challenge"
import { pluralize } from "#/lib/pluralize"
import { NotificationShell, type Target } from "../notification-shell"

export const ChallengeAcceptedRowFragment = graphql(`
	fragment ChallengeAcceptedRow_notification on ChallengeAcceptedNotification {
		id
		createdAt
		actorUsername
		challenge {
			id
			code
			acceptanceCount
		}
	}
`)

export const ChallengeSettledRowFragment = graphql(`
	fragment ChallengeSettledRow_notification on ChallengeSettledNotification {
		id
		createdAt
		challenge {
			id
			code
			state
			creator {
				id
				username
			}
			creatorTally {
				wins
				losses
				draws
			}
			viewerMatchup {
				id
				outcome
				acceptor {
					id
					username
				}
			}
		}
	}
`)

export const ChallengeGloatedRowFragment = graphql(`
	fragment ChallengeGloatedRow_notification on ChallengeGloatedNotification {
		id
		createdAt
		actorUsername
		challenge {
			id
			code
			creator {
				id
				username
			}
		}
	}
`)

export const ChallengePostedToGroupRowFragment = graphql(`
	fragment ChallengePostedToGroupRow_notification on ChallengePostedToGroupNotification {
		id
		createdAt
		actorUsername
		groupName
		challenge {
			id
			code
		}
	}
`)

type RowProps<F> = {
	notification: F
	unread: boolean
	onOpen: (id: string) => void
}

const challengeTarget = (challenge: { code: string } | null): Target =>
	challenge
		? { to: "/challenges/$code", params: { code: challenge.code } }
		: null

const text = css({ fontSize: "sm" })

// Someone took on the viewer's challenge - see acceptChallenge. One per
// challenge, naming whoever accepted last.
export function ChallengeAcceptedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengeAcceptedRowFragment>>) {
	const n = useFragment(ChallengeAcceptedRowFragment, notification)
	const others = (n.challenge?.acceptanceCount ?? 1) - 1
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={challengeTarget(n.challenge)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b>
				{others > 0 && ` and ${others} ${pluralize(others, "other")}`} took on
				your challenge
			</p>
		</NotificationShell>
	)
}

// A challenge the viewer is in is over - see notifyChallengesSettled.
export function ChallengeSettledRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengeSettledRowFragment>>) {
	const n = useFragment(ChallengeSettledRowFragment, notification)
	const { me } = useRouteContext({ from: "__root__" })
	const c = n.challenge
	const message = (() => {
		if (!c) return "A challenge you were in is over"
		if (c.state === "VOIDED")
			return "Every question in a challenge you were in was voided"
		if (c.creator.id === me?.id) {
			return `Your challenge is final: you went ${recordLine(c.creatorTally)}`
		}
		const outcome = c.viewerMatchup?.outcome
		return outcome
			? `Your 1v1 with @${c.creator.username} is final. ${outcomeForSide(outcome, "acceptor")}.`
			: `Your 1v1 with @${c.creator.username} is final`
	})()
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={challengeTarget(c)}
			onOpen={onOpen}
		>
			<p className={text}>{message}</p>
		</NotificationShell>
	)
}

// Someone who beat the viewer in a challenge gloated - see sendChallengeGloat.
export function ChallengeGloatedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengeGloatedRowFragment>>) {
	const n = useFragment(ChallengeGloatedRowFragment, notification)
	const { me } = useRouteContext({ from: "__root__" })
	const c = n.challenge
	// The 1v1 between the viewer and whoever talked trash, named by its
	// acceptor: the viewer when the creator sent it, the sender otherwise.
	const acceptor =
		c && n.actorUsername === c.creator.username ? me?.username : n.actorUsername
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={
				c && acceptor
					? {
							to: "/challenges/$code/vs/$username",
							params: { code: c.code, username: acceptor },
							hash: "trash-talk",
						}
					: challengeTarget(c)
			}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b> beat you and talked trash
			</p>
		</NotificationShell>
	)
}

// Someone posted a challenge into a group the viewer is in - see
// postChallengeToGroups.
export function ChallengePostedToGroupRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengePostedToGroupRowFragment>>) {
	const n = useFragment(ChallengePostedToGroupRowFragment, notification)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiUsers}
			target={challengeTarget(n.challenge)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b> posted a challenge in {n.groupName}
			</p>
		</NotificationShell>
	)
}
