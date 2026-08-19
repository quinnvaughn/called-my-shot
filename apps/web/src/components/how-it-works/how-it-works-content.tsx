import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Accordion } from "#/components/ui/accordion"

function P({ children }: { children: ReactNode }) {
	return (
		<p className={css({ fontSize: "sm", lineHeight: "relaxed", color: "fg.body" })}>
			{children}
		</p>
	)
}

function B({ children }: { children: ReactNode }) {
	return <b className={css({ color: "fg.default", fontWeight: "semibold" })}>{children}</b>
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
				<span className={css({ fontFamily: "mono", fontSize: "2xs", color: "fg.subtle" })}>
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
							<span className={css({ color: "fg.subtle", fontSize: "2xs" })}>→</span>
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
				<span className={css({ fontFamily: "mono", fontSize: "2xs", color: "fg.subtle" })}>
					{floorMult} floor
				</span>
				<span className={css({ fontFamily: "mono", fontSize: "2xs", color: "fg.subtle" })}>
					{ceilingMult} ceiling
				</span>
			</HStack>
		</VStack>
	)
}

const QUESTION_TYPES = [
	{
		title: "Multiple Choice",
		pts: "200 pts",
		desc: "Pick one option from a list the asker set: MVP, series winner, that kind of thing.",
	},
	{
		title: "Yes/No",
		pts: "150 pts",
		desc: "Two fixed options, always. Nothing to configure: it's yes or no.",
	},
	{
		title: "Over/Under",
		pts: "150 pts",
		desc: "Call whether the real result lands above or below a set line.",
	},
	{
		title: "Numeric Guess",
		pts: "250 pts",
		desc: "Guess an exact number. Landing within the tolerance band still counts as a hit.",
	},
	{
		title: "Multi-Select",
		pts: "250 pts / pick",
		desc: "Fixed-slot predictions like First Team All-NBA: pick a set number of players, and each pick is scored as its own full-value bet, not a split pool.",
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
						<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>{t.title}</span>
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
					<span className={css({ fontSize: "xs", lineHeight: "relaxed", color: "fg.subtle" })}>
						{t.desc}
					</span>
				</VStack>
			))}
		</div>
	)
}

export function HowItWorksSections() {
	return (
		<VStack alignItems="stretch" gap="3">
			<Accordion title="The basics" subtitle="Questions vs. calls">
				<P>
					<B>Questions</B> are the prompts: someone asks something, like "Who wins the 2027
					championship?" <B>Calls</B> are your answer to a question, made public under your
					handle. Every call you make is attached to your track record, win or lose.
				</P>
				<P>
					Once you've made a call on a question, the field's picks unlock for you. You can see
					how everyone else called it, but only after you've made your own.
				</P>
			</Accordion>

			<Accordion title="Not a sportsbook" subtitle="No one's setting a line against you">
				<P>
					The Over/Under line, the Multiple Choice options, all of it: set by whoever asked the
					question, not calculated by the platform to balance action on both sides. Nobody's
					adjusting anything based on which way callers are leaning.
				</P>
				<P>
					Your multiplier comes from the <B>field</B> (the real percentage of other callers who
					picked the same thing you did), not from odds set ahead of time. It only exists after
					people have actually called.
				</P>
				<P>
					When you miss, those points aren't going anywhere: there's no other side of the call
					collecting them. And every question resolves against a real-world result, not a line
					anyone's trying to hedge.
				</P>
			</Accordion>

			<Accordion title="Question types" subtitle="Five formats, different base points">
				<P>Base points vary by type: harder-to-call formats are worth more.</P>
				<TypeGrid />
			</Accordion>

			<Accordion
				title="Conviction"
				subtitle="How much of the question's points you're committing"
			>
				<P>
					Every question type has a fixed base point value. When you make a call, you set your{" "}
					<B>conviction</B>, anywhere from 1% to 100%, for how much of that value you're
					actually putting behind the pick. This is separate from how bold the pick itself is;
					what you picked sets the multiplier below, conviction just decides how much of it is in
					play.
				</P>
				<P>Low conviction means a small win or small loss either way. Full conviction means the whole multiplier is on the line.</P>
				<ExampleCard
					label="Formula"
					rows={[{ term: "COMMITTED", expr: "base points × conviction% = committed points" }]}
				/>
			</Accordion>

			<Accordion title="Contrarian tiers" subtitle="Rarer picks pay more, only on a hit">
				<P>
					Your tier isn't something you choose: it's set automatically by how many other
					callers picked the same thing you did, measured against the field's final makeup once
					the question resolves, and relative to how many options the question even had (1-in-20
					means something different than 1-in-2). The rarer your pick, the higher the multiplier
					on a win, scaling smoothly rather than in fixed steps. This applies to Multiple Choice,
					Yes/No, Over/Under, and each pick within a Multi-Select. Numeric Guess works differently
					(see below).
				</P>
				<CurveScale
					labels={["SAFE", "STEADY", "BOLD", "DARING", "FEARLESS"]}
					floorMult="×1"
					ceilingMult="×6"
				/>
				<P>
					The multiplier only pays out on a hit. Miss, and you just lose what you committed; the
					tier doesn't make a miss cost more.
				</P>
			</Accordion>

			<Accordion
				title="How points are calculated"
				subtitle="Committed points × multiplier, worked examples"
			>
				<P>
					Put together, a win is: <B>committed points × contrarian tier × early-call bonus</B>,
					a second multiplier that rewards calling before the field has mostly made up its mind.
					It's based on where your call landed in the field's final call order (not the clock),
					scales smoothly the same way the contrarian tier does, and only ever helps, never hurts:
				</P>
				<CurveScale
					labels={["STANDARD", "AHEAD OF THE CURVE", "EARLY", "FIRST MOVER"]}
					floorMult="×1"
					ceilingMult="×2"
				/>
				<P>A miss is just <B>−committed points</B>, flat, regardless of either multiplier.</P>

				<ExampleCard
					label="Worked example: hit, near-fearless rarity"
					rows={[
						{ term: "COMMITTED", expr: "200 × 60% = 120" },
						{ term: "IF RIGHT", expr: "120 × 6 × 1.5 = +1,080" },
					]}
					note="≈×6 boldness (barely anyone else picked it) · ≈×1.5 early bonus (called in the earliest quarter of the field, by call order)"
				/>
				<ExampleCard
					label="Worked example: miss, safe pick"
					rows={[
						{ term: "COMMITTED", expr: "200 × 70% = 140" },
						{ term: "RESULT", expr: "missed → −140" },
					]}
					note="tier was ≈×1 anyway (a popular pick), but it's irrelevant here; the multiplier never applies to a miss"
				/>

				<P>
					There's no floor at zero on your total score: enough confident misses and your point
					total can go negative. That's the point: the leaderboard only differentiates skill if
					being wrong actually shows up.
				</P>
			</Accordion>

			<Accordion
				title="Numeric Guess scoring"
				subtitle="The same rarity idea, applied to how close you were"
			>
				<P>
					Numeric Guess doesn't have a discrete field to compare against the way Multiple Choice
					or Yes/No does, so it can't use field share directly. It asks the same underlying
					question a different way instead: once a question resolves, how much of the{" "}
					<B>whole field</B> (not just the people who also hit) guessed at least as close to
					the actual result as you did? The smaller that share, the higher your multiplier,
					scaling smoothly on the exact same <B>×1 to ×6</B> curve as the contrarian tier.
				</P>
				<P>
					That's a deliberate choice: if half the field also landed on the same close answer (a
					low-count stat like steals, where a lot of people will correctly guess a small number),
					that's not a rare read and shouldn't pay like one; everyone tied at that distance sits
					near the ×1 floor, the same as a popular option pick. If you're the only one who landed
					that close on a harder, wider-ranging stat, that's genuinely rare, and it pays like it.
					It stacks with the same early-call bonus as every other type.
				</P>
				<ExampleCard
					label="Formula: Numeric Guess"
					rows={[
						{ term: "COMMITTED", expr: "250 × conviction% = committed points" },
						{ term: "IF HIT", expr: "committed × rarity (×1-×6) × early bonus" },
					]}
				/>
				<P>
					You don't need to land on the exact number to hit; that part hasn't changed. Each stat
					carries its own tolerance band, based on how it's typically distributed: a low-count
					stat like blocks or steals gets a wider band (currently 15%) than a high-volume stat
					like points or yards (currently 10%). Before the question resolves, the app shows that
					as an approximate number so it's easier to read. Missing the band is still a flat loss
					of what you committed, same as everywhere else: there's no partial credit for close
					but not close enough.
				</P>
			</Accordion>

			<Accordion title="Multi-Select scoring" subtitle="Each pick scored on its own">
				<P>
					Each pick in a Multi-Select question (like First Team All-NBA) is scored
					independently, using the same contrarian-tier math as everything else, off the same
					250-point base as any other pick: one player might land in FEARLESS while another
					lands in SAFE, and each pays out on its own rather than splitting a shared pool.
				</P>
				<P>
					Conviction can be set once for the whole question (<B>ONE FOR ALL</B>) or individually
					per pick (<B>PER PICK</B>) if you're more confident about some picks than others; that
					toggle just decides how the slider fills in your picks before you submit. Every
					pick is still stored and scored with its own conviction underneath.
				</P>
			</Accordion>

			<Accordion title="Resolution" subtitle="Manual, sourced, and disputable">
				<P>
					Every question resolves against a source stated when it's created: a link or a plain
					description of where the answer was checked (a box score, an official league page,
					wherever fits). There's no fixed source list; it's disclosure, not an automated feed.
				</P>
				<P>
					Resolution is manual: the question's creator marks the outcome once it's official.
					That publishes immediately to every caller.
				</P>
				<P>
					If a result looks wrong, any caller who made a call on that question can dispute it
					with a reason once it's resolved. Filing a dispute moves the question to a{" "}
					<B>disputed</B> state while our team reviews it. They either uphold the original
					resolution or overturn it and correct the result; either way, the question moves back
					to resolved once it's settled.
				</P>
			</Accordion>

			<Accordion title="Leaderboard" subtitle="Points globally, accuracy per league">
				<P>
					The leaderboard ranks by <B>total points</B>, globally, across every league you call.
					Points sum cleanly no matter what you're calling, so they're the fair way to rank
					all-time.
				</P>
				<P>
					Accuracy shows up on both views: a blended number across every league on the global
					leaderboard, and a per-league number once you narrow to one league.
				</P>
			</Accordion>
		</VStack>
	)
}
