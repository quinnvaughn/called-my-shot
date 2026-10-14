import { describe, expect, it } from "vitest"
import {
	makeQuestion,
	makeUser,
	makeYesNoOptions,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"

const CREATE = /* GraphQL */ `
	mutation Create($input: CreateChallengeInput!) {
		createChallenge(input: $input) {
			__typename
			... on ChallengePayload { challenge { code } }
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const ACCEPT = /* GraphQL */ `
	mutation Accept($input: AcceptChallengeInput!) {
		acceptChallenge(input: $input) {
			__typename
			... on ChallengePayload { challenge { acceptanceCount } }
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const CHALLENGE = /* GraphQL */ `
	query Challenge($code: String!) {
		challenge(code: $code) {
			state
			acceptanceCount
			creator { username }
			questions { id }
			viewerCanAccept
			viewerMissingQuestionIds
			viewerMatchup {
				acceptor { username }
				creatorHeadToHead { wins losses draws }
				rows { question { id } }
			}
		}
	}
`

type ChallengeData = {
	challenge: {
		state: string
		acceptanceCount: number
		creator: { username: string }
		questions: { id: string }[]
		viewerCanAccept: boolean
		viewerMissingQuestionIds: string[]
		viewerMatchup: {
			acceptor: { username: string }
			creatorHeadToHead: { wins: number; losses: number; draws: number }
			rows: { question: { id: string } }[]
		} | null
	} | null
}

describe("challenge GraphQL", () => {
	it("shows a challenge to anyone with the link and takes an accept", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const question = await makeQuestion()
		const { no } = await makeYesNoOptions(question.id)

		const created = await expectData<{
			createChallenge: { __typename: string; challenge: { code: string } }
		}>(CREATE, {
			as: creator,
			variables: { input: { questionIds: [question.id] } },
		})
		expect(created.createChallenge.__typename).toBe("ChallengePayload")
		const code = created.createChallenge.challenge.code

		// Signed out, by a lower-cased code.
		const publicView = await expectData<ChallengeData>(CHALLENGE, {
			variables: { code: code.toLowerCase() },
		})
		expect(publicView.challenge).toMatchObject({
			state: "OPEN",
			acceptanceCount: 0,
			creator: { username: creator.username },
			viewerCanAccept: true,
			viewerMissingQuestionIds: [question.id],
			viewerMatchup: null,
		})

		const accepted = await expectData<{
			acceptChallenge: { __typename: string }
		}>(ACCEPT, {
			as: acceptor,
			variables: {
				input: {
					code,
					calls: [
						{
							questionId: question.id,
							selections: [{ optionId: no.id, conviction: 70 }],
						},
					],
				},
			},
		})
		expect(accepted.acceptChallenge.__typename).toBe("ChallengePayload")

		const mine = await expectData<ChallengeData>(CHALLENGE, {
			as: acceptor,
			variables: { code },
		})
		expect(mine.challenge).toMatchObject({
			acceptanceCount: 1,
			viewerCanAccept: false,
			viewerMissingQuestionIds: [],
			viewerMatchup: {
				acceptor: { username: acceptor.username },
				// Nothing between them has settled yet.
				creatorHeadToHead: { wins: 0, losses: 0, draws: 0 },
				rows: [{ question: { id: question.id } }],
			},
		})
	})

	it("returns null for a code nobody has", async () => {
		const data = await expectData<ChallengeData>(CHALLENGE, {
			variables: { code: "ZZZZZZ" },
		})
		expect(data.challenge).toBeNull()
	})
})
