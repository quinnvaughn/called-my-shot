import {
	BASE_POINTS_BY_SHAPE,
	breakEvenHitRate,
	defaultLossRate,
	EARLY_MAX_MULT,
	LOSS_RATE_BY_SHAPE,
	SEASON_EARLY_MAX_MULT,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
} from "@called-my-shot/scoring"
import { useLocation } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Accordion } from "#/components/ui/accordion"

function P({ children }: { children: ReactNode }) {
	return (
		<p
			className={css({
				fontSize: "sm",
				lineHeight: "relaxed",
				color: "fg.body",
			})}
		>
			{children}
		</p>
	)
}

function B({ children }: { children: ReactNode }) {
	return (
		<b className={css({ color: "fg.default", fontWeight: "semibold" })}>
			{children}
		</b>
	)
}

function ExampleCard({
	label,
	rows,
	note,
}: {
	label: string
	rows: { term: string; expr: ReactNode }[]
	note?: string
}) {
	return (
		<VStack
			alignItems="stretch"
			gap="2.5"
			className={css({
				background: "bg.canvas",
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				padding: "3.5",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				{label}
			</span>
			{rows.map((row) => (
				<HStack key={row.term} justify="space-between" gap="3" fontSize="xs">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
							flexShrink: 0,
						})}
					>
						{row.term}
					</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.default",
							textAlign: "right",
						})}
					>
						{row.expr}
					</span>
				</HStack>
			))}
			{note && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{note}
				</span>
			)}
		</VStack>
	)
}

// Both the contrarian tier and the early-call bonus scale smoothly (no fixed
// bands or cutoffs) - these labels are just a rough, human-readable read on
// where a given multiplier falls, not a lookup table. CurveScale shows the
// floor and ceiling multiplier with the label progression between them, to
// communicate the shape without asserting exact breakpoints that don't exist.
function CurveScale({
	labels,
	floorMult,
	ceilingMult,
}: {
	labels: string[]
	floorMult: string
	ceilingMult: string
}) {
	return (
		<VStack alignItems="stretch" gap="1.5">
			<HStack
				justify="space-between"
				gap="2"
				className={css({
					background: "bg.canvas",
					border: "1px solid {colors.border.default}",
					borderRadius: "md",
					padding: "{spacing.2.5} {spacing.3.5}",
				})}
			>
				{labels.map((label, i) => (
					<HStack key={label} gap="2" alignItems="center">
						{i > 0 && (
							<span className={css({ color: "fg.subtle", fontSize: "2xs" })}>
								→
							</span>
						)}
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								fontWeight: "bold",
								letterSpacing: "wide",
								whiteSpace: "nowrap",
							})}
						>
							{label}
						</span>
					</HStack>
				))}
			</HStack>
			<HStack justify="space-between" gap="2" paddingInline="1">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{floorMult} floor
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{ceilingMult} ceiling
				</span>
			</HStack>
		</VStack>
	)
}

// Every scoring number on this page is read from @called-my-shot/scoring, so
// the copy can't drift from how points are actually scored.

// A share in the words the copy uses: "half", "a third".
function fractionWords(share: number): string {
	if (share === 0.5) return "half"
	if (share === 0.25) return "a quarter"
	if (Math.abs(share - 1 / 3) < 1e-9) return "a third"
	return `${Math.round(share * 100)}%`
}

// What a miss costs at a loss rate.
function missCost(lossRate: number): string {
	return lossRate === 1
		? "everything you committed"
		: `${fractionWords(lossRate)} of what you committed`
}

const NUMERIC_LOSS = LOSS_RATE_BY_SHAPE.player_stat_numeric_guess
const SEASON_LEADER_LOSS = LOSS_RATE_BY_SHAPE.player_season_stat_leader
const SINGLE_AWARD_LOSS = LOSS_RATE_BY_SHAPE.player_season_award
const MULTI_AWARD_LOSS = defaultLossRate("player_season_award", {
	picksRequired: 2,
})
const TEAM_GUESS_TARGET = breakEvenHitRate(
	LOSS_RATE_BY_SHAPE.team_stat_numeric_guess,
)

// The worked examples are a yes/no pick.
const EXAMPLE_BASE = BASE_POINTS_BY_SHAPE.yes_no_prop
const EXAMPLE_EARLY_MULT = 1.5
const HIT_COMMITTED = Math.round(EXAMPLE_BASE * 0.6)
const HIT_POINTS = Math.round(
	HIT_COMMITTED * TIER_MAX_MULT * EXAMPLE_EARLY_MULT,
)
const MISS_COMMITTED = Math.round(EXAMPLE_BASE * 0.7)
const MISS_POINTS = Math.round(MISS_COMMITTED * LOSS_RATE_BY_SHAPE.yes_no_prop)

const QUESTION_TYPES = [
	{
		title: "Stat lines & yes/no",
		pts: `${BASE_POINTS_BY_SHAPE.yes_no_prop} pts`,
		desc: "A player or team stat line, a game total, a head-to-head comparison, a yes/no proposition: one pick between two (or a few named) options.",
	},
	{
		title: "Award finalists",
		pts: `${BASE_POINTS_BY_SHAPE.player_award_finalists} pts`,
		desc: "The real announced shortlist for an award: pick the winner once the field's narrowed to a handful of named people. A miss costs a share sized so a pick at random among the finalists breaks even.",
	},
	{
		title: "Numeric guesses",
		pts: `${BASE_POINTS_BY_SHAPE.player_stat_numeric_guess} pts`,
		desc: `Guess an exact number for a player or team stat, one game at a time. Landing within the tolerance band still counts as a hit. A miss costs ${missCost(NUMERIC_LOSS)}.`,
	},
	{
		title: "Stat leaders",
		pts: `${BASE_POINTS_BY_SHAPE.player_game_stat_leader} pts`,
		desc: `Pick who leads a game or a season in a stat, from the full roster. A game leader miss costs a share of what you committed, sized per stat so picking the player with the best season average breaks even. A season leader miss costs ${missCost(SEASON_LEADER_LOSS)}.`,
	},
	{
		title: "Season-long awards",
		pts: `${BASE_POINTS_BY_SHAPE.player_season_award} pts / pick`,
		desc: `MVP, a championship, an All-league team: pick from the full league before the field's known, and each pick is scored at full value on its own, not a split pool. A single-pick award miss costs ${missCost(SINGLE_AWARD_LOSS)}, a title miss costs a share sized per league so picking the best record breaks even, and each wrong pick on an award with several picks costs ${missCost(MULTI_AWARD_LOSS)}.`,
	},
]

function TypeGrid() {
	return (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
				gap: "2.5",
			})}
		>
			{QUESTION_TYPES.map((t) => (
				<VStack
					key={t.title}
					alignItems="stretch"
					gap="1"
					className={css({
						background: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "md",
						padding: "3",
					})}
				>
					<HStack justify="space-between" gap="2">
						<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
							{t.title}
						</span>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
								whiteSpace: "nowrap",
								flexShrink: 0,
							})}
						>
							{t.pts}
						</span>
					</HStack>
					<span
						className={css({
							fontSize: "xs",
							lineHeight: "relaxed",
							color: "fg.subtle",
						})}
					>
						{t.desc}
					</span>
				</VStack>
			))}
		</div>
	)
}

export function HowItWorksSections() {
	// Lets a link elsewhere (e.g. "how resolution works" on a question's own
	// page) arrive here with the relevant section already open, not just
	// scrolled to - a closed accordion header at the top of the viewport
	// isn't actually an answer to whatever the link promised.
	const { hash } = useLocation()

	return (
		<VStack alignItems="stretch" gap="3">
			<Accordion title="The basics" subtitle="Questions vs. calls">
				<P>
					<B>Questions</B> are the prompts: someone asks something, like "Who
					wins the 2027 championship?" <B>Calls</B> are your answer to a
					question, made public under your handle. Every call you make is
					attached to your track record, win or lose.
				</P>
			</Accordion>

			<Accordion
				title="How the numbers are set"
				subtitle="No one's adjusting anything against you"
			>
				<P>
					The number, the options, the award name: all of it set by whoever
					asked the question, not calculated by the platform to balance action
					on both sides. Nobody's adjusting anything based on which way callers
					are leaning.
				</P>
				<P>
					Your multiplier comes from the <B>field</B> (the real percentage of
					other callers who picked the same thing you did), not from anything
					set ahead of time. It only exists after people have actually called.
				</P>
				<P>
					When you miss, those points aren't going anywhere: there's no other
					side of the call collecting them. And every question resolves against
					a real-world result, not a number anyone's trying to manipulate.
				</P>
			</Accordion>

			<Accordion
				title="Question types"
				subtitle="Different formats, different base points"
			>
				<P>Base points vary by shape: harder-to-call formats are worth more.</P>
				<TypeGrid />
			</Accordion>

			<Accordion
				title="Conviction"
				subtitle="How much of the question's points you're committing"
			>
				<P>
					Every question type has a fixed base point value. When you make a
					call, you set your <B>conviction</B>, anywhere from 1% to 100%, for
					how much of that value you're actually putting behind the pick. This
					is separate from how bold the pick itself is; what you picked sets the
					multiplier below, conviction just decides how much of it is in play.
				</P>
				<P>
					Low conviction means a small win or small loss either way. Full
					conviction means the whole multiplier is at risk.
				</P>
				<ExampleCard
					label="Formula"
					rows={[
						{
							term: "COMMITTED",
							expr: "base points × conviction% = committed points",
						},
					]}
				/>
			</Accordion>

			<Accordion
				title="Contrarian tiers"
				subtitle="Rarer picks score higher, only on a hit"
			>
				<P>
					Your tier isn't something you choose: it's set automatically by how
					many other callers picked the same thing you did, measured against the
					field's final makeup once the question resolves, and relative to how
					many options the question even had (1-in-20 means something different
					than 1-in-2). The rarer your pick, the higher the multiplier on a win,
					scaling smoothly rather than in fixed steps. This applies to every
					option-based shape: stat lines, props, head-to-head picks, award
					finalists, and each pick within a season-long award. The numeric-guess
					shapes work differently (see below).
				</P>
				<CurveScale
					labels={["SAFE", "STEADY", "BOLD", "DARING", "FEARLESS"]}
					floorMult={`×${TIER_MIN_MULT}`}
					ceilingMult={`×${TIER_MAX_MULT}`}
				/>
				<P>
					The multiplier only applies on a hit. Miss, and you lose what you
					committed (or a set share of it on the harder question types, see
					below); the tier doesn't make a miss cost more.
				</P>
			</Accordion>

			<Accordion
				title="How points are calculated"
				subtitle="Committed points × multiplier, worked examples"
			>
				<P>
					Put together, a win is:{" "}
					<B>committed points × contrarian tier × early-call bonus</B>, a second
					multiplier that rewards calling before the field has mostly made up
					its mind. It's based on where your call landed in the field's final
					call order (not the clock), scales smoothly the same way the
					contrarian tier does, and only ever helps, never hurts:
				</P>
				<CurveScale
					labels={["STANDARD", "AHEAD OF THE CURVE", "EARLY", "FIRST MOVER"]}
					floorMult="×1"
					ceilingMult={`×${EARLY_MAX_MULT}`}
				/>
				<P>
					That call-order version is for single-game questions. A question
					that spans a season (a season-long stat line, award finalists, or a
					season-long award) can't use call order the same way, since calls
					trickle in unevenly over months rather than filling up in an hour;
					instead it's based on <B>how much of the season had been played</B>{" "}
					when you called, on a wider range since a whole season's worth of
					unknowns is a bigger gap than a few hours of other people's takes:
				</P>
				<CurveScale
					labels={["STANDARD", "EARLY SEASON", "FIRST QUARTER", "PRESEASON"]}
					floorMult="×1"
					ceilingMult={`×${SEASON_EARLY_MAX_MULT}`}
				/>
				<P>
					A miss is <B>−committed points × loss rate</B>, flat, regardless of
					either multiplier. The loss rate is set by question type and saved on
					the question when it's posted, so it can't change after you call. Stat
					lines, yes/no, and head-to-head picks lose{" "}
					{missCost(LOSS_RATE_BY_SHAPE.yes_no_prop)}. A numeric guess loses{" "}
					{missCost(NUMERIC_LOSS)}. A game stat leader pick loses a share sized
					per stat so picking the player with the best season average breaks
					even, and a season stat leader pick loses{" "}
					{missCost(SEASON_LEADER_LOSS)}. A single-pick season award loses{" "}
					{missCost(SINGLE_AWARD_LOSS)}, and each wrong pick on an award with
					several picks loses {missCost(MULTI_AWARD_LOSS)}. A title pick loses a
					share sized per league so picking the best regular-season record
					breaks even, and a finalists pick loses a share sized so a pick at
					random among the finalists breaks even. Everything past a two-option
					pick misses far more often than it hits, and the rarity multiplier
					can't make up for that when only a few people have called.
				</P>

				<ExampleCard
					label="Worked example: hit, near-fearless rarity"
					rows={[
						{
							term: "COMMITTED",
							expr: `${EXAMPLE_BASE} × 60% = ${HIT_COMMITTED}`,
						},
						{
							term: "IF RIGHT",
							expr: `${HIT_COMMITTED} × ${TIER_MAX_MULT} × ${EXAMPLE_EARLY_MULT} = +${HIT_POINTS.toLocaleString("en-US")}`,
						},
					]}
					note={`≈×${TIER_MAX_MULT} boldness (barely anyone else picked it) · ≈×${EXAMPLE_EARLY_MULT} early bonus (called in the earliest quarter of the field, by call order)`}
				/>
				<ExampleCard
					label="Worked example: miss, safe pick"
					rows={[
						{
							term: "COMMITTED",
							expr: `${EXAMPLE_BASE} × 70% = ${MISS_COMMITTED}`,
						},
						{
							term: "RESULT",
							expr: `missed → −${MISS_POINTS.toLocaleString("en-US")}`,
						},
					]}
					note={`tier was ≈×${TIER_MIN_MULT} anyway (a popular pick), but it's irrelevant here; the multiplier never applies to a miss`}
				/>

				<P>
					There's no floor at zero on your total score: enough confident misses
					and your point total can go negative. That's the point: the
					leaderboard only differentiates skill if being wrong actually shows
					up.
				</P>
			</Accordion>

			<Accordion
				title="Numeric guess scoring"
				subtitle="The same rarity idea, applied to how close you were"
			>
				<P>
					A numeric guess doesn't have a discrete field to compare against the
					way an option-based shape does, so it can't use field share directly.
					It asks the same underlying question a different way instead: once a
					question resolves, how much of the <B>whole field</B> (not just the
					people who also hit) guessed at least as close to the actual result as
					you did? The smaller that share, the higher your multiplier, scaling
					smoothly on the exact same{" "}
					<B>
						×{TIER_MIN_MULT} to ×{TIER_MAX_MULT}
					</B>{" "}
					curve as the contrarian tier.
				</P>
				<P>
					That's a deliberate choice: if half the field also landed on the same
					close answer (a low-count stat like steals, where a lot of people will
					correctly guess a small number), that's not a rare read and shouldn't
					score like one; everyone tied at that distance sits near the ×
					{TIER_MIN_MULT} floor, the same as a popular option pick. If you're
					the only one who landed that close on a harder, wider-ranging stat,
					that's genuinely rare, and it scores like it. It stacks with the same
					early-call bonus as every other type.
				</P>
				<ExampleCard
					label="Formula: numeric guess"
					rows={[
						{
							term: "COMMITTED",
							expr: `${BASE_POINTS_BY_SHAPE.player_stat_numeric_guess} × conviction% = committed points`,
						},
						{
							term: "IF HIT",
							expr: `committed × rarity (×${TIER_MIN_MULT}-×${TIER_MAX_MULT}) × early bonus`,
						},
						{ term: "IF MISS", expr: `−committed × ${NUMERIC_LOSS}` },
					]}
				/>
				<P>
					You don't need to land on the exact number to hit; that part hasn't
					changed. Each stat carries its own tolerance band, based on how it's
					typically distributed: a low-count stat like blocks or steals gets a
					wider band (currently 15%) than a high-volume stat like yards or a
					player's points (currently 10%). A team's final score gets a fixed
					band instead, since how much a score swings doesn't track how big it
					is. That band is sized from recent final scores so a guess at a team's
					own average lands inside it about {fractionWords(TEAM_GUESS_TARGET)}{" "}
					of the time, and it adjusts as the season goes. Before the question
					resolves, the app shows that as an approximate number so it's easier
					to read. Missing the band costs {missCost(NUMERIC_LOSS)}, flat:
					there's no partial credit for close but not close enough.
				</P>
			</Accordion>

			<Accordion
				title="Season award scoring"
				subtitle="Each pick scored on its own"
			>
				<P>
					Each pick in a season-long award question (like First Team All-NBA)
					is scored independently, using the same contrarian-tier math as
					everything else, off the same{" "}
					{BASE_POINTS_BY_SHAPE.player_season_award}-point base as any other
					pick: one player might land in FEARLESS while another lands in SAFE,
					and each scores on its own rather than splitting a shared pool.
				</P>
				<P>
					Conviction can be set once for the whole question (<B>ONE FOR ALL</B>)
					or individually per pick (<B>PER PICK</B>) if you're more confident
					about some picks than others; that toggle just decides how the slider
					fills in your picks before you submit. Every pick is still stored and
					scored with its own conviction underneath.
				</P>
			</Accordion>

			<Accordion
				id="resolution"
				title="Resolution"
				subtitle="Manual, sourced, and disputable"
				defaultOpen={hash === "resolution"}
			>
				<P>
					Every question resolves against a source stated when it's created: a
					link or a plain description of where the answer was checked (a box
					score, an official league page, wherever fits). There's no fixed
					source list; it's disclosure, not an automated feed.
				</P>
				<P>
					Resolution is manual: the question's creator marks the outcome once
					it's official. That publishes immediately to every caller.
				</P>
				<P>
					If a result looks wrong, any caller who made a call on that question
					can dispute it with a reason once it's resolved. Filing a dispute
					moves the question to a <B>disputed</B> state while our team reviews
					it. They either uphold the original resolution or overturn it and
					correct the result; either way, the question moves back to resolved
					once it's settled.
				</P>
			</Accordion>

			<Accordion
				title="Leaderboard"
				subtitle="Global by default, narrows to one league"
			>
				<P>
					The leaderboard ranks by <B>total points</B>. The default view sums
					points across every league you've called in; narrow to a single
					league and it re-ranks using points earned in that league alone, not
					your global total.
				</P>
				<P>
					Accuracy follows the same scope: a blended number across every league
					on the global view, and a per-league number once you narrow to one
					league.
				</P>
			</Accordion>
		</VStack>
	)
}
