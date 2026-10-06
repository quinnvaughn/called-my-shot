import { Link } from "@tanstack/react-router"
import { Fragment, type ReactNode, useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { BallotSectionHeading } from "#/components/ballots/ballot-section-heading"
import { Card } from "#/components/ui/card"
import { ChipButton } from "#/components/ui/chip-button"
import { TeamBadge } from "#/components/ui/team-badge"
import { SetBallotTiebreakOrderDocument } from "#/graphql/mutations/ballots"
import { useGqlMutation } from "#/graphql/hooks"
import {
	projectStandings,
	type StandingsRow,
	type StandingsSection,
	type StandingsTeamInput,
	tiebreakOrderAfterMove,
} from "#/lib/projected-standings"
import { showToast } from "#/stores/toast-store"

type Props = {
	leagueSlug: string
	leagueAbbreviation: string
	gamesPerSeason: number
	teams: StandingsTeamInput[]
	// Questions whose tie order the viewer can still change: their own picks,
	// still open. Empty for anyone else's ballot.
	reorderableQuestionIds: Set<string>
	// Whose picks these are, for the summary line ("Your picks", "@sam's picks").
	ownerLabel: string
	// Set where ties are ordered in place (the ballot page). Null on a page
	// that only shows standings, which gets `orderElsewhere` instead.
	editing: { ballotId: string; onSaved: () => void } | null
	// Shown in place of the arrows when the viewer has a tie they could order
	// somewhere else.
	orderElsewhere?: ReactNode
}

// Moves a row past the one below it or above it in its table. Null where
// that row can't move that way, or isn't the viewer's to move.
type MoveHandlers = {
	up: (() => void) | null
	down: (() => void) | null
}

// A win-totals ballot read as the standings it implies, in the league's own
// playoff format. Teams on the same total can trade places right in the
// table; the new order shows at once and saves behind the scenes.
export function ProjectedStandings({
	leagueSlug,
	leagueAbbreviation,
	gamesPerSeason,
	teams,
	reorderableQuestionIds,
	ownerLabel,
	editing,
	orderElsewhere,
}: Props) {
	// Tie orders set here and not yet reflected in `teams`.
	const [pending, setPending] = useState<Map<string, number>>(new Map())
	const setOrder = useGqlMutation(SetBallotTiebreakOrderDocument)
	const [conferenceKey, setConferenceKey] = useState<string | null>(null)

	const current = teams.map((team) => ({
		...team,
		tiebreakPosition: pending.get(team.questionId) ?? team.tiebreakPosition,
	}))
	const standings = projectStandings({
		leagueSlug,
		gamesPerSeason,
		teams: current,
	})
	if (!standings) return null
	const shown =
		standings.conferences.find((c) => c.conference === conferenceKey) ??
		standings.conferences[0]

	async function move(
		{ ballotId, onSaved }: NonNullable<Props["editing"]>,
		movingId: string,
		targetId: string,
	) {
		const order = tiebreakOrderAfterMove(current, movingId, targetId)
		const previous = pending
		setPending((existing) => {
			const next = new Map(existing)
			for (const [position, id] of order.entries()) next.set(id, position)
			return next
		})
		try {
			const { setBallotTiebreakOrder: result } = await setOrder.mutateAsync({
				ballotId,
				questionIds: order,
			})
			if (result.__typename !== "MutationSetBallotTiebreakOrderSuccess") {
				throw new Error(result.message ?? "Couldn't save that order.")
			}
			onSaved()
		} catch (caught) {
			setPending(previous)
			showToast({
				message:
					caught instanceof Error ? caught.message : "Couldn't save that order.",
			})
		}
	}

	// Both rows have to be the viewer's own open picks for them to trade places.
	const neighbours = (section: StandingsSection, i: number) => {
		const row = section.rows[i]
		const above = section.rows[i - 1]
		const below = section.rows[i + 1]
		const mine = (r: StandingsRow | undefined) =>
			r !== undefined && reorderableQuestionIds.has(r.team.questionId)
		return {
			above: row.canMoveUp && mine(row) && mine(above) ? above : null,
			below: row.canMoveDown && mine(row) && mine(below) ? below : null,
		}
	}
	const movesFor = (section: StandingsSection, i: number): MoveHandlers => {
		const { above, below } = neighbours(section, i)
		const id = section.rows[i].team.questionId
		return {
			up:
				editing && above
					? () => move(editing, id, above.team.questionId)
					: null,
			down:
				editing && below
					? () => move(editing, id, below.team.questionId)
					: null,
		}
	}
	const hasTies = shown?.sections.some((section) =>
		section.rows.some((_, i) => {
			const { above, below } = neighbours(section, i)
			return above !== null || below !== null
		}),
	)

	const off = standings.projectedWins - standings.leagueWins
	const allPicked = standings.pickedCount === standings.teamCount

	return (
		<VStack gap="6" alignItems="stretch">
			<VStack gap="1" alignItems="flex-start">
				<span className={css({ fontSize: "sm", color: "fg.muted" })}>
					{allPicked
						? `${ownerLabel} add up to ${standings.projectedWins} wins. A full ${leagueAbbreviation} season has exactly ${standings.leagueWins}, one per game.`
						: `${standings.pickedCount} of ${standings.teamCount} teams picked. Unpicked teams sit at the bottom of their group.`}
				</span>
				{allPicked && off !== 0 && (
					<span className={css({ fontSize: "sm", color: "warning.default" })}>
						{off > 0
							? `That's ${off} more ${off === 1 ? "win" : "wins"} than the schedule allows.`
							: `That's ${-off} ${off === -1 ? "win" : "wins"} short of what the schedule hands out.`}
					</span>
				)}
			</VStack>

			{standings.conferences.length > 1 && (
				<HStack gap="2" flexWrap="wrap">
					{standings.conferences.map((conference) => {
						const selected = conference.conference === shown?.conference
						return (
							<ChipButton
								key={conference.conference}
								selected={selected}
								pressed={selected}
								onClick={() => setConferenceKey(conference.conference)}
							>
								{conference.label}
							</ChipButton>
						)
					})}
				</HStack>
			)}

			{shown && (
				<VStack gap="3" alignItems="stretch">
					{shown.seedsNote && (
						<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
							{shown.seedsNote}
						</span>
					)}
					{hasTies &&
						(editing ? (
							<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
								Teams on the same win total go alphabetically until you
								change it. Use the arrows to set who finishes ahead.
							</span>
						) : (
							orderElsewhere
						))}
					<Card>
						<VStack gap="0" alignItems="stretch">
							{shown.sections.map((section) => (
								<SectionRows
									key={section.key}
									section={section}
									showLosses={standings.showLosses}
									movesFor={movesFor}
								/>
							))}
						</VStack>
					</Card>
				</VStack>
			)}
		</VStack>
	)
}

function SectionRows({
	section,
	showLosses,
	movesFor,
}: {
	section: StandingsSection
	showLosses: boolean
	movesFor: (section: StandingsSection, i: number) => MoveHandlers
}) {
	// A line under the last row says nothing the end of the table doesn't.
	const lineAfter = new Map(
		section.lines
			.filter((line) => line.after >= 0 && line.after < section.rows.length - 1)
			.map((line) => [line.after, line.label]),
	)
	return (
		<>
			<BallotSectionHeading label={section.label} />
			{section.rows.map((row, i) => (
				<Fragment key={row.team.questionId}>
					<StandingsRowView
						row={row}
						showLosses={showLosses}
						moves={movesFor(section, i)}
					/>
					{lineAfter.has(i) && <CutLine label={lineAfter.get(i) ?? ""} />}
				</Fragment>
			))}
		</>
	)
}

function CutLine({ label }: { label: string }) {
	return (
		<HStack
			gap="2"
			alignItems="center"
			paddingInline="3"
			paddingBlock="1"
			className={css({ borderBottom: "1px dashed {colors.border.emphasized}" })}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
		</HStack>
	)
}

function statusLabel(row: StandingsRow): string | null {
	return match(row.status)
		.with("bye", () => "Bye")
		.with("playIn", () => "Play-in")
		.with("playoff", "out", null, () => null)
		.exhaustive()
}

function StandingsRowView({
	row,
	showLosses,
	moves,
}: {
	row: StandingsRow
	showLosses: boolean
	moves: MoveHandlers
}) {
	const picked = row.wins !== null
	const detail = [
		statusLabel(row),
		row.team.conviction === null ? null : `${row.team.conviction}% conviction`,
	]
		.filter((part) => part !== null)
		.join(" · ")
	const movable = moves.up !== null || moves.down !== null
	return (
		<HStack
			gap="3"
			alignItems="center"
			paddingInline="3"
			paddingBlock="2.5"
			className={css({
				borderBottom: "1px solid {colors.border.default}",
				_last: { borderBottom: "none" },
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.subtle",
					width: "5",
					flexShrink: "0",
				})}
			>
				{row.rank ?? ""}
			</span>
			<TeamLink team={row.team}>
				<TeamBadge
					abbreviation={row.team.abbreviation}
					color={row.team.color}
					logoUrl={row.team.logoUrl}
				/>
				<VStack gap="0" alignItems="flex-start" flex="1" minWidth="0">
					<span
						className={css({
							fontSize: "sm",
							fontWeight: "medium",
							color: picked ? "fg.default" : "fg.subtle",
							truncate: true,
							width: "full",
						})}
					>
						{row.team.name}
					</span>
					{detail && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "3xs",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "fg.subtle",
							})}
						>
							{detail}
						</span>
					)}
				</VStack>
			</TeamLink>
			{movable && (
				<VStack gap="0.5" flexShrink="0">
					<MoveButton label={`Move ${row.team.name} up`} onClick={moves.up}>
						<FiChevronUp />
					</MoveButton>
					<MoveButton
						label={`Move ${row.team.name} down`}
						onClick={moves.down}
					>
						<FiChevronDown />
					</MoveButton>
				</VStack>
			)}
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "sm",
					fontWeight: "bold",
					color: picked ? "fg.default" : "fg.subtle",
					flexShrink: "0",
				})}
			>
				{match(row)
					.with({ wins: null }, () => "No pick")
					.otherwise(({ wins, losses }) =>
						showLosses ? `${wins}-${losses}` : `${wins} W`,
					)}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					fontWeight: "bold",
					color: "secondary.default",
					width: "8",
					textAlign: "right",
					flexShrink: "0",
				})}
			>
				{row.seed ?? ""}
			</span>
		</HStack>
	)
}

const teamLinkClass = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	flex: "1",
	minWidth: "0",
	color: "inherit",
	textDecoration: "none",
	_hover: { opacity: 0.8 },
})

// Just the badge and name, so the move arrows beside them stay buttons of
// their own rather than sitting inside a link.
function TeamLink({
	team,
	children,
}: {
	team: StandingsTeamInput
	children: ReactNode
}) {
	return team.callId ? (
		<Link
			to="/calls/$callId"
			params={{ callId: team.callId }}
			className={teamLinkClass}
		>
			{children}
		</Link>
	) : (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{ questionId: team.questionId }}
			className={teamLinkClass}
		>
			{children}
		</Link>
	)
}

// Half-height so a pair stacks into the height of one row. A direction the
// row can't go stays as a disabled button, keeping both arrows where the eye
// expects them.
function MoveButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: (() => void) | null
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={onClick === null}
			onClick={onClick ?? undefined}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: "6",
				height: "4",
				borderRadius: "sm",
				border: "1px solid {colors.border.default}",
				backgroundColor: "bg.surface",
				color: "fg.default",
				fontSize: "xs",
				cursor: "pointer",
				_hover: { borderColor: "border.emphasized" },
				_disabled: { opacity: 0.3, cursor: "default" },
			})}
		>
			{children}
		</button>
	)
}
