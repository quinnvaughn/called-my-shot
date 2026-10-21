import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GroupBallotEntryRow } from "#/components/groups/group-ballot-entry-row"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Identity } from "#/components/ui/identity"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import { GroupBallotBoardDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { toIdentity } from "#/lib/identity"

const groupBallotBoardQuery = (groupId: string, ballotSlug: string) =>
	gqlQueryOptions(GroupBallotBoardDocument, {
		groupId,
		ballotId: ballotSlug,
	})

export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/ballots/$ballotSlug",
)({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context, params }) =>
		context.queryClient.query(
			groupBallotBoardQuery(params.groupId, params.ballotSlug),
		),
})

const sectionLabelClass = css({
	textStyle: "label",
	color: "fg.subtle",
})

function RouteComponent() {
	const { groupId, ballotSlug } = Route.useParams()
	const { data } = useSuspenseQuery(groupBallotBoardQuery(groupId, ballotSlug))
	const me = useMe()
	const group = data.group
	const board = group?.ballotBoard

	if (!group || !board) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Group"
				heading={
					group ? "This ballot doesn't exist" : "This group doesn't exist"
				}
				subtitle="It may have been removed, or the link's just wrong."
				link={{ text: "View your groups", url: "/spaces" }}
			/>
		)
	}

	const { ballot, entries, notStarted } = board
	const memberCount = entries.length + notStarted.length
	const finishedCount = entries.filter((e) => e.completedAt).length
	// nextLocksAt is null once every member has locked, so nothing on the
	// ballot can be called any more.
	const isOpen = ballot.nextLocksAt !== null
	const showPoints = entries.some((e) => e.wins + e.losses > 0)
	const viewerEntry = entries.find((e) => e.user.id === me?.id)

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link to="/spaces">Spaces</Breadcrumb.Link>
				<Breadcrumb.Link to="/groups/$groupId" params={{ groupId: group.id }}>
					{group.name}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{ballot.name}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{ballot.league.abbreviation}</Tag>
				<PageHeader
					title={`${group.name} on ${ballot.name}`}
					subtitle={`${finishedCount} of ${memberCount} finished`}
				/>
			</VStack>

			{isOpen && !viewerEntry?.completedAt && (
				<Link
					to="/ballots/$ballotSlug"
					params={{ ballotSlug: ballot.slug }}
					className={arrowLink({ tone: "primary" })}
				>
					{viewerEntry
						? `Finish your ballot · ${viewerEntry.calledCount} of ${ballot.memberCount} called →`
						: "Fill out your ballot →"}
				</Link>
			)}

			<VStack gap="3" alignItems="stretch">
				{entries.length === 0 ? (
					<EmptyState>No one in the group has started this ballot.</EmptyState>
				) : (
					entries.map((entry) => (
						<GroupBallotEntryRow
							key={entry.user.id}
							ballotSlug={ballot.slug}
							memberCount={ballot.memberCount}
							groupId={group.id}
							entry={entry}
							isViewer={entry.user.id === me?.id}
							showPoints={showPoints}
						/>
					))
				)}
			</VStack>

			{notStarted.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<span className={sectionLabelClass}>
						{isOpen ? "Not started" : "Didn't fill it out"} ·{" "}
						{notStarted.length}
					</span>
					<Card>
						<VStack gap="0" alignItems="stretch">
							{notStarted.map((member) => {
								const user = toIdentity(member)
								return (
									<div
										key={user.id}
										className={css({
											padding: "3",
											borderBottom: "1px solid {colors.border.default}",
											_last: { borderBottom: "none" },
										})}
									>
										<Identity
											name={user.name}
											username={user.username}
											avatarUrl={user.avatarUrl}
											flair={user.flair}
										/>
									</div>
								)
							})}
						</VStack>
					</Card>
				</VStack>
			)}
		</VStack>
	)
}
