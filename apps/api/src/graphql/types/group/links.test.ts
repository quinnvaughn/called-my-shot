import { describe, expect, it } from "vitest"
import { makeGroup, makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// A group's links are the admin's socials and websites, saved as a whole
// ordered set. The api stores the normalized url and an optional label;
// recognising the platform is left to the client (describeLink).

const UPDATE_LINKS = /* GraphQL */ `
	mutation UpdateGroupLinks($input: UpdateGroupLinksInput!) {
		updateGroupLinks(input: $input) {
			__typename
			... on GroupPayload { group { links { url label } } }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

const GROUP_LINKS = /* GraphQL */ `
	query GroupLinks($groupId: ID!) {
		group(id: $groupId) { links { url label } }
	}
`

type Link = { url: string; label: string | null }
type UpdateResult =
	| { __typename: "GroupPayload"; group: { links: Link[] } }
	| {
			__typename: "ValidationError"
			fieldErrors: { field: string | null; message: string }[]
	  }
	| ErrorResult

describe("group links", () => {
	it("saves normalized urls in the order given", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })

		const data = await expectData<{ updateGroupLinks: UpdateResult }>(
			UPDATE_LINKS,
			{
				as: admin,
				variables: {
					input: {
						groupId: group.id,
						links: [
							{ url: "discord.gg/celtics" },
							{ url: "https://x.com/celtics/", label: "  " },
							{ url: "celticstalk.com", label: "Podcast" },
						],
					},
				},
			},
		)

		expect(data.updateGroupLinks).toEqual({
			__typename: "GroupPayload",
			group: {
				links: [
					{ url: "https://discord.gg/celtics", label: null },
					{ url: "https://x.com/celtics", label: null },
					{ url: "https://celticstalk.com", label: "Podcast" },
				],
			},
		})
	})

	it("replaces the whole set, so reordering and removing both stick", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const save = (links: { url: string }[]) =>
			expectData<{ updateGroupLinks: UpdateResult }>(UPDATE_LINKS, {
				as: admin,
				variables: { input: { groupId: group.id, links } },
			})

		await save([{ url: "a.com" }, { url: "b.com" }, { url: "c.com" }])
		await save([{ url: "c.com" }, { url: "a.com" }])

		const reordered = await expectData<{ group: { links: Link[] } }>(
			GROUP_LINKS,
			{ as: admin, variables: { groupId: group.id } },
		)
		expect(reordered.group.links.map((l) => l.url)).toEqual([
			"https://c.com",
			"https://a.com",
		])

		await save([])
		const cleared = await expectData<{ group: { links: Link[] } }>(
			GROUP_LINKS,
			{ as: admin, variables: { groupId: group.id } },
		)
		expect(cleared.group.links).toEqual([])
	})

	it("rejects a non-web url against the link it came from", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })

		const data = await expectData<{ updateGroupLinks: UpdateResult }>(
			UPDATE_LINKS,
			{
				as: admin,
				variables: {
					input: {
						groupId: group.id,
						links: [{ url: "x.com/celtics" }, { url: "javascript:alert(1)" }],
					},
				},
			},
		)

		expect(data.updateGroupLinks).toMatchObject({
			__typename: "ValidationError",
			fieldErrors: [{ field: "links.1.url" }],
		})
	})

	it("rejects the same link twice once normalized", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })

		const data = await expectData<{ updateGroupLinks: UpdateResult }>(
			UPDATE_LINKS,
			{
				as: admin,
				variables: {
					input: {
						groupId: group.id,
						links: [
							{ url: "x.com/celtics" },
							{ url: "https://x.com/celtics/" },
						],
					},
				},
			},
		)

		expect(data.updateGroupLinks).toMatchObject({
			__typename: "ValidationError",
			fieldErrors: [{ field: "links.1.url" }],
		})
	})

	it("only lets admins change them", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin, members: [member] })

		const data = await expectData<{ updateGroupLinks: UpdateResult }>(
			UPDATE_LINKS,
			{
				as: member,
				variables: {
					input: { groupId: group.id, links: [{ url: "x.com/celtics" }] },
				},
			},
		)

		expect(data.updateGroupLinks.__typename).toBe("AuthorizationError")
	})
})
