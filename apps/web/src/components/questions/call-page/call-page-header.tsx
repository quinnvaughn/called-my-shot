import { css } from "styled-system/css"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { SeriesBlock } from "#/components/questions/series-block"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import type { CallRecord } from "#/lib/call-view"
import { buildQuestionSlug } from "#/lib/slug"

type Props = {
	call: CallRecord
}

export function CallPageHeader({ call }: Props) {
	return (
		<>
			<Breadcrumb>
				<Breadcrumb.Link
					to="/leagues/$leagueSlug"
					params={{ leagueSlug: call.question.league.slug }}
				>
					{call.question.league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Link
					to="/questions/$questionId/{-$slug}"
					params={{
						questionId: call.question.id,
						slug: buildQuestionSlug(call.question.title),
					}}
				>
					{call.question.title}
				</Breadcrumb.Link>
				<Breadcrumb.Current>@{call.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			{/* The question is the page's title, as it is on the question page,
			and the card below is one person's answer to it - whose is on the
			card's own header. */}
			<h1 className={css({ fontSize: "2xl", fontFamily: "heading" })}>
				{call.question.title}
			</h1>

			{/* Which game or series the title is about, as on the question
			page: "Who will win?" means nothing without it. */}
			{call.question.game && <GameMatchupHeader game={call.question.game} />}
			{call.question.series && <SeriesBlock series={call.question.series} />}
		</>
	)
}
