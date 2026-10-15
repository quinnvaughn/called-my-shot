import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { PostChallengeModal } from "#/components/challenges/post-challenge-modal"
import { GloatComposerModal } from "#/components/gloats/gloat-composer-modal"
import { Button, button } from "#/components/ui/button"
import type { ChallengePageQuery } from "#/graphql/generated/graphql"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"

type Props = {
	challenge: NonNullable<ChallengePageQuery["challenge"]>
	isCreator: boolean
	canAccept: boolean
	gifsEnabled: boolean
}

export function ChallengeHeroAction({
	challenge,
	isCreator,
	canAccept,
	gifsEnabled,
}: Props) {
	const creator = challenge.creator

	return canAccept ? (
		<Link
			to="/challenges/$code/play"
			params={{ code: challenge.code }}
			className={button({ variant: "solid", size: "lg", fullWidth: true })}
		>
			Take on @{creator.username}
		</Link>
	) : challenge.viewerCanGloat ? (
		<Button
			variant="solid"
			size="lg"
			fullWidth
			onClick={() =>
				openModal(
					<GloatComposerModal
						challengeId={challenge.id}
						gifsEnabled={gifsEnabled}
						recipients={
							isCreator
								? `the ${challenge.creatorTally.wins} ${pluralize(challenge.creatorTally.wins, "person", "people")} you beat`
								: `@${creator.username}`
						}
					/>,
				)
			}
		>
			{isCreator
				? "Talk trash to everyone you beat"
				: `Talk trash to @${creator.username}`}
		</Button>
	) : isCreator && challenge.state === "OPEN" ? (
		<HStack gap="3" flexWrap="wrap">
			<p className={css({ fontSize: "sm", color: "fg.muted", flex: "1" })}>
				Call every question before it locks. One you don't call counts as 0 for
				you in every 1v1.
			</p>
			<Button
				variant="outline"
				size="sm"
				onClick={() =>
					openModal(<PostChallengeModal challengeId={challenge.id} />)
				}
			>
				Post to a group
			</Button>
		</HStack>
	) : null
}
