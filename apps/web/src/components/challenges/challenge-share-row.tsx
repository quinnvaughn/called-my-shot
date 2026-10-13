import { ShareIconRow } from "#/components/ui/share-icon-row"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

// The challenge's link, which is how anyone gets in.
export function ChallengeShareRow({
	challengeId,
	code,
	creatorUsername,
	isCreator,
	questionCount,
}: {
	challengeId: string
	code: string
	creatorUsername: string
	isCreator: boolean
	questionCount: number
}) {
	const questions = `${questionCount} ${pluralize(questionCount, "question")}`
	return (
		<ShareIconRow
			url={`${SITE_ORIGIN}/challenges/${code}`}
			campaign="challenge"
			shareTitle={`@${creatorUsername}'s challenge`}
			tweetText={
				isCreator
					? `I made my calls on ${questions}. Think you'd score more? Take me on:`
					: `@${creatorUsername} made their calls on ${questions}. Take them on:`
			}
			onShared={(method) =>
				track("challenge_link_shared", { challengeId, receipt: false, method })
			}
		/>
	)
}
