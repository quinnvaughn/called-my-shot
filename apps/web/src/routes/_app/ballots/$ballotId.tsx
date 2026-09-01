import { createFileRoute, Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	BallotCompletionsList,
	BallotCompletionsListFragment,
} from "#/components/ballots/ballot-completions-list"
import {
	BallotPositionRow,
	BallotPositionRowFragment,
} from "#/components/ballots/ballot-position-row"
import { BallotProgressCard } from "#/components/ballots/ballot-progress-card"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import { useFragment } from "#/graphql/generated"
import { BallotByIdDocument } from "#/graphql/queries/ballots"
import { computeBallotProgressStats } from "#/lib/ballot-progress-stats"

// Public - a shared link or a scraper can land here signed out, same as the
// `ballot` query itself (resolves null for anything not published). This is
// the ONLY public view of a ballot; the admin builder at /admin/ballots is a
// separate, admin-only page for assembling one.
export const Route = createFileRoute("/_app/ballots/$ballotId")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: BallotByIdDocument,
			variables: { id: params.ballotId },
			fetchPolicy: "network-only",
		})
		return { ballot: data?.ballot ?? null }
	},
	head: ({ loaderData }) => {
		const ballot = loaderData?.ballot
		if (!ballot) return {}
		const title = `${ballot.name} · Called My Shot`
		const description = `${ballot.memberCount} question${ballot.memberCount === 1 ? "" : "s"} in the ${ballot.league.name} ${ballot.name}.`
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
			],
		}
	},
})

function RouteComponent() {
	const { ballot } = Route.useLoaderData()

	// Unmasked once here (not per-row) - the server already returns members
	// in sortOrder (see BallotRef.members' orderBy), so no client-side sort
	// is needed either. useFragment is a plain data transform, not a real
	// hook, but is still named/tripped up like one by the top-level-hook-call
	// lint, so both calls happen unconditionally before the not-found branch
	// below rather than after it.
	const members = useFragment(BallotPositionRowFragment, ballot?.members ?? [])
	const completions = useFragment(
		BallotCompletionsListFragment,
		ballot?.completions,
	)

	if (!ballot) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Ballot"
				heading="This ballot doesn't exist"
				subtitle="It may not be published yet, or the link's just wrong."
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	const stats = computeBallotProgressStats(members)

	// The soonest still-upcoming lock across every member - a member already
	// past its own locksAt (open-and-called, or resolved) has nothing left to
	// warn about here, so it's excluded rather than dragging the ballot-level
	// line back into the past.
	const now = DateTime.now()
	const upcomingLocks = members
		.map((m) => DateTime.fromISO(m.question.locksAt))
		.filter((dt) => dt > now)
	const soonestLock =
		upcomingLocks.length > 0
			? upcomingLocks.reduce((a, b) => (b < a ? b : a))
			: null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Link
				to="/leagues/$leagueId/season"
				params={{ leagueId: ballot.league.id }}
				className={css({
					display: "inline-flex",
					alignItems: "center",
					gap: "1.5",
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
					_hover: { color: "fg.default" },
				})}
			>
				<FiChevronLeft size={11} />
				{ballot.league.abbreviation} · Season
			</Link>

			<VStack gap="2" alignItems="flex-start">
				<HStack gap="2">
					<Tag>{ballot.league.abbreviation}</Tag>
					<Tag variant="primary">Official</Tag>
				</HStack>
				<PageHeader
					title={ballot.name}
					subtitle={
						ballot.memberCount === 1
							? "1 question"
							: `${ballot.memberCount} questions`
					}
				/>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					{soonestLock
						? `Locks ${soonestLock.toRelative()}`
						: "All positions locked"}
				</span>
			</VStack>

			<BallotProgressCard
				calledCount={stats.calledCount}
				memberCount={ballot.memberCount}
				remainingOpenCount={stats.remainingOpenCount}
				isComplete={stats.isComplete}
				offFieldCount={stats.offFieldCount}
				contestedCount={stats.contestedCount}
				fullBallotCount={completions?.count ?? 0}
			/>

			{stats.nextUncalled && (
				<Link
					to="/questions/$questionId"
					params={{ questionId: stats.nextUncalled.question.id }}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "1.5",
						width: "full",
						backgroundColor: "bg.subtle",
						border: "1px solid {colors.primary.default}",
						borderRadius: "lg",
						paddingBlock: "3",
						fontFamily: "mono",
						fontSize: "xs",
						fontWeight: "bold",
						letterSpacing: "wide",
						color: "primary.default",
						_hover: { backgroundColor: "primary.subtle" },
					})}
				>
					<span className={css({ textTransform: "uppercase" })}>
						Continue ballot · Next:{" "}
						{stats.nextUncalled.slot || stats.nextUncalled.label}
					</span>
					<FiChevronRight />
				</Link>
			)}
			<VStack gap="3" alignItems="stretch">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						color: "fg.subtle",
						textTransform: "uppercase",
					})}
				>
					Questions
				</span>
				<Card>
					<VStack gap="0" alignItems="stretch">
						{ballot.members.map((member, i) => (
							// Rendered from the still-masked ballot.members (passed
							// straight through, unmasked again inside
							// BallotPositionRow) - members[i] is the same list
							// already unmasked above for the id this needs as a key.
							<BallotPositionRow key={members[i].id} member={member} />
						))}
					</VStack>
				</Card>
			</VStack>

			<VStack gap="3" alignItems="stretch">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						color: "fg.subtle",
						textTransform: "uppercase",
					})}
				>
					Completed ballots
				</span>
				<BallotCompletionsList summary={ballot.completions} />
			</VStack>
		</VStack>
	)
}
