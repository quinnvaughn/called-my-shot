import { Breadcrumb } from "#/components/ui/breadcrumb"

type Props = {
	post: {
		author: { username: string }
		group: { id: string; name: string } | null
		prompt: {
			code: string
			title: string
			league: { slug: string; abbreviation: string } | null
		}
	}
}

// Where a redraft sits: the group it was posted in or its league, then the
// class, then whose it is. A share link lands here with no history, so this
// is the way to the rest of it.
export function RedraftBreadcrumb({ post }: Props) {
	const { prompt, group } = post
	return (
		<Breadcrumb>
			{group ? (
				<Breadcrumb.Link to="/groups/$groupId" params={{ groupId: group.id }}>
					{group.name}
				</Breadcrumb.Link>
			) : (
				prompt.league && (
					<Breadcrumb.Link
						to="/leagues/$leagueSlug"
						params={{ leagueSlug: prompt.league.slug }}
					>
						{prompt.league.abbreviation}
					</Breadcrumb.Link>
				)
			)}
			<Breadcrumb.Link to="/redraft/$code" params={{ code: prompt.code }}>
				{prompt.title}
			</Breadcrumb.Link>
			<Breadcrumb.Current>@{post.author.username}</Breadcrumb.Current>
		</Breadcrumb>
	)
}
