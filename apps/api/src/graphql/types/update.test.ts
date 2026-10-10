import { describe, expect, it } from "vitest"
import { makeAdmin, makeUser } from "../../test/factories"
import { execute, expectData } from "../../test/graphql"

const CREATE = `
	mutation ($input: UpdateInput!) {
		createUpdate(input: $input) {
			__typename
			... on Update { id slug publishedAt }
			... on ValidationError { fieldErrors { field message } }
			... on AuthorizationError { message }
		}
	}
`

const PUBLISH = `
	mutation ($id: ID!, $published: Boolean!) {
		setUpdatePublished(id: $id, published: $published) {
			... on Update { slug publishedAt }
		}
	}
`

const input = {
	title: "Face the press",
	summary: "Answer questions about your calls after a game.",
	body: "When a game ends you get a presser.",
}

async function createDraft(as: Awaited<ReturnType<typeof makeAdmin>>) {
	const data = await expectData<{ createUpdate: { id: string } }>(CREATE, {
		as,
		variables: { input },
	})
	return data.createUpdate.id
}

describe("product updates", () => {
	it("only lets admins write them", async () => {
		const user = await makeUser()
		const data = await expectData<{ createUpdate: { __typename: string } }>(
			CREATE,
			{ as: user, variables: { input } },
		)
		expect(data.createUpdate.__typename).toBe("AuthorizationError")
	})

	it("keeps drafts off the public list until published", async () => {
		const admin = await makeAdmin()
		const id = await createDraft(admin)

		const before = await expectData<{ updates: unknown[] }>(
			"{ updates { id } }",
		)
		expect(before.updates).toHaveLength(0)

		await expectData(PUBLISH, { as: admin, variables: { id, published: true } })
		const after = await expectData<{ updates: { id: string }[] }>(
			"{ updates { id } }",
		)
		expect(after.updates.map((u) => u.id)).toEqual([id])
	})

	it("gives each post its own slug on first publish and keeps it", async () => {
		const admin = await makeAdmin()
		const first = await createDraft(admin)
		const second = await createDraft(admin)

		const a = await expectData<{ setUpdatePublished: { slug: string } }>(
			PUBLISH,
			{ as: admin, variables: { id: first, published: true } },
		)
		const b = await expectData<{ setUpdatePublished: { slug: string } }>(
			PUBLISH,
			{ as: admin, variables: { id: second, published: true } },
		)
		expect(a.setUpdatePublished.slug).toBe("face-the-press")
		expect(b.setUpdatePublished.slug).toBe("face-the-press-2")

		// Unpublish and republish: same url as before.
		await expectData(PUBLISH, {
			as: admin,
			variables: { id: first, published: false },
		})
		const again = await expectData<{ setUpdatePublished: { slug: string } }>(
			PUBLISH,
			{ as: admin, variables: { id: first, published: true } },
		)
		expect(again.setUpdatePublished.slug).toBe("face-the-press")
	})

	it("won't delete a post that was already emailed", async () => {
		const admin = await makeAdmin()
		const id = await createDraft(admin)
		await expectData(PUBLISH, { as: admin, variables: { id, published: true } })
		await expectData(
			`mutation ($id: ID!) { sendUpdateEmail(id: $id) { __typename } }`,
			{
				as: admin,
				variables: { id },
			},
		)

		const result = await execute(
			`mutation ($id: ID!) {
				deleteUpdate(id: $id) {
					__typename
					... on ValidationError { fieldErrors { message } }
				}
			}`,
			{ as: admin, variables: { id } },
		)
		expect(result.data?.deleteUpdate).toMatchObject({
			__typename: "ValidationError",
		})
	})
})
