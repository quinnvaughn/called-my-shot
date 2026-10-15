import { Tabs } from "#/components/ui/tabs"
import type { UserProfileQuery } from "#/graphql/generated/graphql"

type Leagues = NonNullable<UserProfileQuery["userByUsername"]>["leagues"]

// One tab per league played, plus All. A single league skips the row
// entirely, since All and that league would be the same page.
export function ProfileLeagueTabs({
	username,
	leagues,
}: {
	username: string
	leagues: Leagues
}) {
	if (leagues.length <= 1) return null
	return (
		<Tabs.List>
			<Tabs.LinkTrigger
				to="/user/$username"
				params={{ username }}
				search={{ league: undefined }}
				// Without explicitUndefined, All's empty search would match
				// every league's url too and stay lit alongside it.
				activeOptions={{ includeSearch: true, explicitUndefined: true }}
			>
				All
			</Tabs.LinkTrigger>
			{leagues.map((row) => (
				<Tabs.LinkTrigger
					key={row.league.id}
					to="/user/$username"
					params={{ username }}
					search={{ league: row.league.slug }}
					activeOptions={{ includeSearch: true }}
				>
					{row.league.abbreviation}
				</Tabs.LinkTrigger>
			))}
		</Tabs.List>
	)
}
