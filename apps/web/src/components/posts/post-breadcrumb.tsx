import { Breadcrumb } from "#/components/ui/breadcrumb"
import { teamSlug } from "#/lib/team-slug"

type Props = {
	post: {
		author: { username: string }
		group: { id: string; name: string } | null
		prompt: {
			code: string
			title: string
			isFranchise: boolean
			league: { slug: string; abbreviation: string } | null
			team: { name: string; abbreviation: string } | null
		}
	}
}

// Where a post sits, read off what it's about rather than its address: the
// group it was posted in, or the league and team its prompt is about, then
// the prompt, then whose it is. A share link lands here with no history, so
// this is the way to the rest of it.
export function PostBreadcrumb({ post }: Props) {
	const { prompt, group } = post
	// Under its team, a franchise prompt's title only repeats the team's name.
	const promptLabel =
		!group && prompt.isFranchise && prompt.team ? "Rushmore" : prompt.title
	return (
		<Breadcrumb>
			{group ? (
				<Breadcrumb.Link to="/groups/$groupId" params={{ groupId: group.id }}>
					{group.name}
				</Breadcrumb.Link>
			) : (
				prompt.league && (
					<>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug"
							params={{ leagueSlug: prompt.league.slug }}
						>
							{prompt.league.abbreviation}
						</Breadcrumb.Link>
						{prompt.team && (
							<>
								<Breadcrumb.Link
									to="/leagues/$leagueSlug/teams"
									params={{ leagueSlug: prompt.league.slug }}
								>
									Teams
								</Breadcrumb.Link>
								<Breadcrumb.Link
									to="/leagues/$leagueSlug/teams/$teamSlug"
									params={{
										leagueSlug: prompt.league.slug,
										teamSlug: teamSlug(prompt.team.abbreviation),
									}}
								>
									{prompt.team.name}
								</Breadcrumb.Link>
							</>
						)}
					</>
				)
			)}
			<Breadcrumb.Link to="/rushmore/$code" params={{ code: prompt.code }}>
				{promptLabel}
			</Breadcrumb.Link>
			<Breadcrumb.Current>@{post.author.username}</Breadcrumb.Current>
		</Breadcrumb>
	)
}
