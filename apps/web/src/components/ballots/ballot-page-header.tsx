import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { LockLine } from "#/components/questions/lock-line"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import type { BallotByRefQuery } from "#/graphql/generated/graphql"
import { pluralize } from "#/lib/pluralize"

type Props = {
	ballot: NonNullable<BallotByRefQuery["ballot"]>
	// The soonest still-upcoming lock across the ballot's members. Null once
	// every position has locked.
	soonestLock: string | null
}

export function BallotPageHeader({ ballot, soonestLock }: Props) {
	return (
		<>
			<Breadcrumb>
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
				<Breadcrumb.Current>{ballot.name}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{ballot.league.abbreviation}</Tag>
				<PageHeader
					title={ballot.name}
					subtitle={`${ballot.memberCount} ${pluralize(ballot.memberCount, "question")}`}
				/>
				<span
					className={css({
						textStyle: "metaLg",
						color: "fg.subtle",
					})}
				>
					{soonestLock ? (
						<LockLine status="OPEN" locksAt={soonestLock} />
					) : (
						"All positions locked"
					)}
				</span>
			</VStack>
		</>
	)
}
