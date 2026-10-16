import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"
import { SignedPoints } from "#/components/ui/signed-points"
import { Slider } from "#/components/ui/slider"
import { Tag } from "#/components/ui/tag"
import { DemoBoard } from "./demo-board"
import {
	buildDemo,
	DEMO_CONVICTION,
	DEMO_MATCHUP,
	type DemoCast,
	LANDING_CAST,
} from "./demo-fixture"
import { DemoPresser } from "./demo-presser"
import { DemoSide } from "./demo-side"
import { DEMO_STEP, useDemoTimeline } from "./use-demo-timeline"

const hidden = css({
	opacity: 0,
	transform: "translateY(6px)",
	transition: "opacity 0.3s ease, transform 0.3s ease",
})
const shown = css({
	opacity: 1,
	transform: "none",
	transition: "opacity 0.3s ease, transform 0.3s ease",
})

const panel = css({
	backgroundColor: "bg.subtle",
	borderRadius: "md",
	padding: "3",
})

// A call playing out inside a group, on a loop: pick a side, set conviction,
// lock at kickoff, then the result, the group board moving, and a groupmate's
// presser question. Built from the app's own pieces on made-up data, and not
// interactive. `cast` puts it in a real group (its invite page); the landing
// page's made-up group otherwise.
export function GroupCallDemo({ cast = LANDING_CAST }: { cast?: DemoCast }) {
	const demo = useMemo(() => buildDemo(cast), [cast])
	const { step, conviction, replay } = useDemoTimeline()
	const picked = step >= DEMO_STEP.picked
	const final = step >= DEMO_STEP.final
	const status =
		step < DEMO_STEP.locked ? "Locks at kickoff" : final ? "Final" : "Locked"
	const against = demo.sides.find((s) => !s.isPick)?.groupmates.length ?? 0

	return (
		<VStack gap="3" alignItems="stretch">
			<figure
				aria-label={`Example: a call on ${DEMO_MATCHUP} inside a group. You take the Bills at conviction ${DEMO_CONVICTION}, they win, you get ${demo.points} points, move up the group leaderboard, and a groupmate asks about it in your presser.`}
			>
				<Card>
					<Card.Body>
						{/* Inert: the call form's own controls, shown as a picture. */}
						<div inert aria-hidden>
							<VStack gap="4" alignItems="stretch">
								<HStack gap="3">
									<GroupLogo
										name={cast.groupName}
										src={cast.groupLogoUrl}
										size="sm"
									/>
									<VStack gap="0" alignItems="flex-start" flex="1">
										<span
											className={css({
												fontSize: "sm",
												fontWeight: "semibold",
											})}
										>
											{cast.groupName}
										</span>
										<span
											className={css({ textStyle: "meta", color: "fg.subtle" })}
										>
											{cast.groupMeta}
										</span>
									</VStack>
									<Tag size="sm" variant={final ? "secondary" : "neutral"}>
										{status}
									</Tag>
								</HStack>

								<h3
									className={css({
										fontFamily: "heading",
										fontSize: "lg",
										lineHeight: "snug",
									})}
								>
									{DEMO_MATCHUP}. Who wins?
								</h3>

								<VStack gap="3" alignItems="stretch">
									{demo.sides.map((side) => {
										const isPick = side.isPick
										return (
											<DemoSide
												key={side.id}
												label={side.label}
												fieldPct={side.fieldPct}
												groupmates={
													isPick && picked
														? ["You", ...side.groupmates]
														: [...side.groupmates]
												}
												picked={isPick && picked}
												final={final ? side.final : null}
											/>
										)
									})}
								</VStack>

								<VStack gap="2" alignItems="stretch">
									<HStack justify="space-between">
										<span
											className={css({ textStyle: "label", color: "fg.muted" })}
										>
											Conviction
										</span>
										<span
											className={css({ fontFamily: "heading", fontSize: "md" })}
										>
											{conviction}
										</span>
									</HStack>
									<Slider value={Math.max(1, conviction)} onChange={() => {}} />
								</VStack>

								<HStack
									justify="space-between"
									gap="3"
									className={cx(panel, final ? shown : hidden)}
								>
									<p
										className={css({
											fontSize: "sm",
											lineHeight: "snug",
											color: "fg.body",
										})}
									>
										Called it. You and {demo.ally} took the Bills over {against}{" "}
										of your group.
									</p>
									<SignedPoints value={demo.points} suffix=" pts" pill />
								</HStack>

								<div
									className={css({
										display: "grid",
										gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
										gap: "3",
									})}
								>
									<div
										className={cx(
											panel,
											step >= DEMO_STEP.board ? shown : hidden,
										)}
									>
										<DemoBoard board={demo.board} />
									</div>
									<div
										className={cx(
											panel,
											step >= DEMO_STEP.presser ? shown : hidden,
										)}
									>
										<DemoPresser {...demo.presser} />
									</div>
								</div>
							</VStack>
						</div>
					</Card.Body>
				</Card>
			</figure>
			<HStack justify="space-between">
				<Link
					to="/how-it-works"
					className={css({
						fontSize: "sm",
						color: "fg.muted",
						_hover: { color: "fg.default" },
					})}
				>
					How scoring works
				</Link>
				<button
					type="button"
					onClick={replay}
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
						cursor: "pointer",
						_hover: { color: "fg.default" },
					})}
				>
					↻ Replay
				</button>
			</HStack>
		</VStack>
	)
}
