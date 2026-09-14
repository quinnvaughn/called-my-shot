import { Link, useRouteContext } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { slateSweepText } from "#/lib/sweep-progress"

export const SlateSweepLineFragment = graphql(`
	fragment SlateSweepLine_progress on SlateSweepProgress {
		status
		slateKey
		gameCount
		calledCount
		winCount
		lossCount
		missedGames {
			id
			awayTeam {
				id
				abbreviation
			}
			homeTeam {
				id
				abbreviation
			}
		}
		lostGames {
			id
			awayTeam {
				id
				abbreviation
			}
			homeTeam {
				id
				abbreviation
			}
		}
	}
`)

type Props = {
	progress: FragmentType<typeof SlateSweepLineFragment>
	leagueSlug: string
}

// The viewer's sweep of one slate, under its header on the Games tab. A
// finished sweep links to its page.
export function SlateSweepLine({ progress: progressProp, leagueSlug }: Props) {
	const progress = useFragment(SlateSweepLineFragment, progressProp)
	const { me } = useRouteContext({ from: "__root__" })
	const text = slateSweepText(progress)
	const className = css({
		fontFamily: "mono",
		fontSize: "2xs",
		letterSpacing: "wide",
		textDecoration: "none",
		color: match(progress.status)
			.with("SWEPT", () => "success.default")
			.with("ALIVE", () => "fg.muted")
			.with("OFF", () => "fg.subtle")
			.exhaustive(),
	})

	if (progress.status === "SWEPT" && me) {
		return (
			<Link
				to="/user/$username/sweeps/$league/$slateKey"
				params={{
					username: me.username,
					league: leagueSlug,
					slateKey: progress.slateKey,
				}}
				className={className}
			>
				{text} →
			</Link>
		)
	}
	return <span className={className}>{text}</span>
}
