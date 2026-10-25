import { Breadcrumb } from "#/components/ui/breadcrumb"
import { teamSlug } from "#/lib/team-slug"

type Props = {
	prompt: {
		title: string
		isFranchise: boolean
		league: { slug: string; abbreviation: string }
		team: { name: string; abbreviation: string } | null
	}
}

// A prompt's place under the league and team it's about, so its page
// (the address printed on the crowd's image) leads back to their spaces.
export function PromptBreadcrumb({ prompt }: Props) {
	return (
		<Breadcrumb>
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
			<Breadcrumb.Current>
				{prompt.isFranchise && prompt.team ? "Rushmore" : prompt.title}
			</Breadcrumb.Current>
		</Breadcrumb>
	)
}
