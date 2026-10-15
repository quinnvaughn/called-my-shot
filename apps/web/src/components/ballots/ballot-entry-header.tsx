import { VStack } from "styled-system/jsx"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import type {
	BallotEntryQuery,
	GroupCrumbQuery,
} from "#/graphql/generated/graphql"

type Ballot = NonNullable<BallotEntryQuery["ballot"]>

type Props = {
	ballot: Ballot
	entry: NonNullable<Ballot["entry"]>
	// The group board the page was opened from, which the breadcrumb leads
	// back to in place of the league's ballots.
	crumbGroup: GroupCrumbQuery["group"]
}

export function BallotEntryHeader({ ballot, entry, crumbGroup }: Props) {
	return (
		<>
			<Breadcrumb>
				{crumbGroup ? (
					<>
						<Breadcrumb.Link
							to="/groups/$groupId"
							params={{ groupId: crumbGroup.id }}
						>
							{crumbGroup.name}
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/groups/$groupId/ballots/$ballotSlug"
							params={{ groupId: crumbGroup.id, ballotSlug: ballot.slug }}
						>
							{ballot.name}
						</Breadcrumb.Link>
					</>
				) : (
					<>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug"
							params={{ leagueSlug: ballot.league.slug }}
						>
							{ballot.league.abbreviation}
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug/ballots"
							params={{ leagueSlug: ballot.league.slug }}
						>
							Ballots
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/ballots/$ballotSlug"
							params={{ ballotSlug: ballot.slug }}
						>
							{ballot.name}
						</Breadcrumb.Link>
					</>
				)}
				<Breadcrumb.Current>@{entry.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{ballot.league.abbreviation}</Tag>
				<PageHeader
					title={ballot.name}
					subtitle={`${entry.user.name}'s picks`}
				/>
			</VStack>
		</>
	)
}
