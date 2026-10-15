import { Link } from "@tanstack/react-router"
import { FiCheckCircle, FiXCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { SignedPoints } from "#/components/ui/signed-points"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { resolvedFadeLine } from "#/lib/fade-copy"
import { matchupLabel } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"
import { NotificationShell, type Target } from "../notification-shell"

export const GameResolvedRowFragment = graphql(`
	fragment GameResolvedRow_notification on GameResolvedNotification {
		id
		createdAt
		game {
			id
			homeTeam {
				abbreviation
			}
			awayTeam {
				abbreviation
			}
		}
		entry {
			wins
			losses
			points
			user {
				username
			}
		}
		presser {
			id
			isOpen
			pendingCount
		}
		fades {
			questionTitle
			call {
				id
			}
			fade {
				fadedUsername
				fadeLanded
				targetFlipped
				doubtersCashed
				doubtersWrong
				gloatOpen
			}
		}
	}
`)

type Props = {
	notification: FragmentType<typeof GameResolvedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Every settled call of the viewer's on one game, as one row that comes back
// unread as each later call on it settles. Opens their picks page for the
// game, where each call is listed; a call a fade touched gets its own line
// underneath, linking to the call page where its gloat is sent from.
export function GameResolvedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(GameResolvedRowFragment, notificationProp)
	const { game, entry } = n
	const matchup = game ? matchupLabel(game) : "this game"
	const settled = entry ? entry.wins + entry.losses : 0
	const target: Target =
		game && entry
			? {
					to: "/games/$gameId/picks/$username",
					params: { gameId: game.id, username: entry.user.username },
				}
			: null
	// Once their presser on the game opens, and until it closes.
	const pendingCount = n.presser?.pendingCount ?? 0
	const presserLine = n.presser?.isOpen
		? pendingCount > 0
			? `Your presser is open. ${pendingCount} ${pluralize(pendingCount, "question")} waiting.`
			: "Your presser is open."
		: null
	const fadeLines = n.fades.flatMap((f) => {
		const line = resolvedFadeLine(f.fade)
		return line ? [{ callId: f.call.id, title: f.questionTitle, line }] : []
	})

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={entry && entry.points < 0 ? FiXCircle : FiCheckCircle}
			target={target}
			onOpen={onOpen}
			trailing={
				entry ? (
					<SignedPoints value={entry.points} zeroSign suffix=" PTS" pill />
				) : null
			}
			footer={
				(fadeLines.length > 0 || presserLine) && (
					<VStack gap="1.5" alignItems="stretch">
						{presserLine && game && entry && (
							<Link
								to="/games/$gameId/picks/$username"
								params={{ gameId: game.id, username: entry.user.username }}
								hash="presser"
								className={css({
									fontSize: "sm",
									color: "secondary.default",
									textDecoration: "none",
									_hover: { opacity: 0.8 },
								})}
							>
								{presserLine}
							</Link>
						)}
						{fadeLines.map((f) => (
							<Link
								key={f.callId}
								to="/calls/$callId"
								params={{ callId: f.callId }}
								className={css({
									fontSize: "sm",
									color: "fg.muted",
									textDecoration: "none",
									_hover: { color: "fg.default" },
								})}
							>
								<span className={css({ color: "fg.default" })}>{f.title}:</span>{" "}
								{f.line}
							</Link>
						))}
					</VStack>
				)
			}
		>
			<p className={css({ fontSize: "sm" })}>
				{settled === 0
					? `Your calls on ${matchup} settled`
					: settled === 1
						? `Your call on ${matchup} ${entry?.wins ? "hit" : "missed"}`
						: `Your ${matchup} calls: ${entry?.wins} of ${settled} hit`}
			</p>
		</NotificationShell>
	)
}
