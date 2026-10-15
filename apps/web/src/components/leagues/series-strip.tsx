import { CardRail } from "#/components/ui/card-rail"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type Series, SeriesCard } from "./series-card"

type Props = {
	// id and winnerTeamId selected beside the fragment, to key and order the
	// cards without unmasking it here.
	series: ({ id: string; winnerTeamId: string | null } & Series)[]
	// The rounds on now, as one phrase (see roundsPhrase).
	heading: string
	leagueSlug: string
}

// The postseason's current rounds at a glance, above the Games tab's day
// stepper: one card per series with where it stands and its next game.
// Finished series trail the ones still being played.
export function SeriesStrip({ series, heading, leagueSlug }: Props) {
	const items = [...series].sort(
		(a, b) => Number(a.winnerTeamId !== null) - Number(b.winnerTeamId !== null),
	)
	return (
		<CardRail
			items={items}
			getKey={(item) => item.id}
			header={<Eyebrow size="sm">{heading}</Eyebrow>}
			itemLabel="series"
			renderItem={(item) => (
				<SeriesCard series={item} leagueSlug={leagueSlug} />
			)}
		/>
	)
}
