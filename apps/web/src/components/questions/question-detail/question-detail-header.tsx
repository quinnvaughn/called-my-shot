import { Link } from "@tanstack/react-router"
import { FiFlag, FiShare } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ShareQuestionModal } from "#/components/questions/share-question-modal"
import { Button, button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useMe } from "#/hooks/use-me"
import { track } from "#/lib/analytics"
import { openModal } from "#/stores/modal-store"
import type { QuestionDetail } from "./types"

// The share and challenge actions, and the title.
// `created` offers a challenge on a question the viewer has just written.
export function QuestionDetailHeader({
	question,
	created,
}: {
	question: QuestionDetail
	created: boolean | undefined
}) {
	const me = useMe()

	return (
		<VStack gap="3" alignItems="stretch">
			{/* The title with the actions beside it, or under it on a phone,
			    where beside it they'd squeeze the title into a narrow column.
			    What kind of question this is, its league and whether it's
			    official are already said by the title, the breadcrumb and the
			    matchup, and a community question's maker is named in the context
			    strip and the details card. */}
			<div
				className={css({
					display: "flex",
					flexDirection: { base: "column", md: "row" },
					justifyContent: "space-between",
					alignItems: { base: "stretch", md: "flex-start" },
					gap: "3",
				})}
			>
				<h1
					className={css({
						minWidth: "0",
						fontSize: { base: "xl", md: "2xl" },
						fontFamily: "heading",
						textWrap: "pretty",
					})}
				>
					{question.title}
				</h1>
				<HStack gap="2" flexShrink="0">
					{/* Shares the QUESTION - an invitation to call it. Distinct from
				the link on a settled call below, which shares one person's own
				record of it. Available regardless of status or whether you've
				called: an open question is the one most worth sending someone. */}
					<Button
						variant="ghost"
						size="sm"
						aria-label="Share this question"
						onClick={() => {
							track("share_sheet_opened", {
								questionId: question.id,
								surface: "question_detail",
							})
							openModal(
								<ShareQuestionModal
									questionId={question.id}
									questionTitle={question.title}
									questionLeague={question.league}
									sharedGroupIds={question.viewerSharedGroupIds}
									pinnedGroupIds={question.viewerPinnedGroupIds}
									canShareToGroup={me !== null}
									canPin={
										question.status === "OPEN" &&
										new Date(question.locksAt) > new Date()
									}
								/>,
							)
						}}
						className={css({ flexShrink: 0 })}
					>
						<FiShare size={14} />
						Share
					</Button>
					{me &&
						question.status === "OPEN" &&
						new Date(question.locksAt) > new Date() && (
							// On a game's question it opens the builder the way the
							// rail's "Start a challenge" does, with the viewer's other
							// open picks on the game already in, this question among
							// them. From xl up that rail is on screen, so this would
							// be a second, lesser copy of it.
							<Link
								to="/challenges/new"
								search={
									question.game
										? {
												game: question.game.id,
												question: question.id,
												source: "question",
											}
										: { question: question.id, source: "question" }
								}
								className={cx(
									button({ variant: "light", size: "sm" }),
									question.game
										? css({ flexShrink: 0, xl: { display: "none" } })
										: css({ flexShrink: 0 }),
								)}
							>
								<FiFlag size={14} />
								Start a challenge
							</Link>
						)}
				</HStack>
			</div>
			{created &&
				me &&
				question.status === "OPEN" &&
				new Date(question.locksAt) > new Date() && (
					<Card variant="subtle" size="sm">
						<Card.Body>
							<HStack justify="space-between" gap="3" flexWrap="wrap">
								<p className={css({ fontSize: "sm" })}>
									Think people will get this wrong? Challenge them on it.
									Whoever scores more points on it wins the 1v1.
								</p>
								<Link
									to="/challenges/new"
									search={{
										question: question.id,
										source: "new_question",
									}}
									className={button({ variant: "solid", size: "sm" })}
								>
									Make a challenge
								</Link>
							</HStack>
						</Card.Body>
					</Card>
				)}
		</VStack>
	)
}
