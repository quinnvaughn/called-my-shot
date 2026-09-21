import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groups, teams, userFlairs, users } from "../../../db/schema"
import {
	makeAdmin,
	makeFlair,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

const MY_FLAIRS = `
	query {
		myFlairs {
			id
			key
			icon
			label
			color
			source
		}
	}
`

const EQUIP = `
	mutation ($flairId: ID!) {
		equipFlair(flairId: $flairId) {
			__typename
			... on User { id equippedFlair { id label } }
			... on ValidationError { message }
		}
	}
`

const UNEQUIP = `
	mutation {
		unequipFlair {
			__typename
			... on User { id equippedFlair { id } }
		}
	}
`

const GRANT = `
	mutation ($userId: ID!, $flairId: ID!) {
		grantFlair(userId: $userId, flairId: $flairId) {
			__typename
			... on User { id grantedFlairs { id } }
			... on ValidationError { message }
		}
	}
`

const REVOKE = `
	mutation ($userId: ID!, $flairId: ID!) {
		revokeFlair(userId: $userId, flairId: $flairId) {
			__typename
			... on User { id equippedFlair { id } grantedFlairs { id } }
		}
	}
`

type FlairChip = {
	id: string
	label: string | null
	icon?: string | null
	color?: string | null
}
type FlairUserResult = {
	__typename: string
	equippedFlair?: FlairChip | null
	grantedFlairs?: { id: string }[]
}

function teamFlair(teamId: string, overrides = {}) {
	return makeFlair({
		source: "team",
		unlock: "open",
		teamId,
		// A team flair carries none of its own display fields - they come off
		// the team row.
		icon: null,
		label: null,
		color: null,
		...overrides,
	})
}

describe("equipFlair", () => {
	it("equips an open team flair with no grant row", async () => {
		const user = await makeUser()
		const team = await makeTeam({ name: "Boston Celtics", abbreviation: "BOS" })
		const flair = await teamFlair(team.id)

		const data = await expectData<{ equipFlair: FlairUserResult }>(EQUIP, {
			as: user,
			variables: { flairId: flair.id },
		})

		expect(data.equipFlair.__typename).toBe("User")
		expect(data.equipFlair.equippedFlair?.id).toBe(flair.id)
		expect(data.equipFlair.equippedFlair?.label).toBe("Boston Celtics")

		// Nothing was written to the grants table - that's the whole point of
		// an "open" flair.
		const grants = await db.select().from(userFlairs)
		expect(grants).toHaveLength(0)
	})

	it("refuses a grant-locked flair the user hasn't been given", async () => {
		const user = await makeUser()
		const flair = await makeFlair()

		const data = await expectData<{ equipFlair: FlairUserResult }>(EQUIP, {
			as: user,
			variables: { flairId: flair.id },
		})

		expect(data.equipFlair.__typename).toBe("ValidationError")
	})

	it("allows the same flair once it has been granted", async () => {
		const user = await makeUser()
		const flair = await makeFlair()
		await db.insert(userFlairs).values({ userId: user.id, flairId: flair.id })

		const data = await expectData<{ equipFlair: FlairUserResult }>(EQUIP, {
			as: user,
			variables: { flairId: flair.id },
		})

		expect(data.equipFlair.__typename).toBe("User")
		expect(data.equipFlair.equippedFlair?.id).toBe(flair.id)
	})

	it("refuses a retired flair", async () => {
		const user = await makeUser()
		const team = await makeTeam()
		const flair = await teamFlair(team.id, { status: "retired" })

		const data = await expectData<{ equipFlair: FlairUserResult }>(EQUIP, {
			as: user,
			variables: { flairId: flair.id },
		})

		expect(data.equipFlair.__typename).toBe("ValidationError")
	})

	// The reserved group-scope column is what the later per-group feature
	// hangs off. A group's flair must never be wearable site-wide, and this is
	// the assertion that holds the model to it before anything writes one.
	it("refuses a group-scoped flair in the site-wide slot", async () => {
		const user = await makeUser()
		const owner = await makeUser()
		const [group] = await db
			.insert(groups)
			.values({ name: "Sunday Crew", createdBy: owner.id })
			.returning()
		const flair = await makeFlair({
			source: "group",
			unlock: "open",
			scopeGroupId: group?.id,
		})

		const data = await expectData<{ equipFlair: FlairUserResult }>(EQUIP, {
			as: user,
			variables: { flairId: flair.id },
		})

		expect(data.equipFlair.__typename).toBe("ValidationError")
	})

	it("requires a signed-in user", async () => {
		const team = await makeTeam()
		const flair = await teamFlair(team.id)

		const data = await expectData<{ equipFlair: FlairUserResult }>(EQUIP, {
			variables: { flairId: flair.id },
		})

		expect(data.equipFlair.__typename).toBe("AuthenticationError")
	})
})

describe("unequipFlair", () => {
	it("clears the equipped flair", async () => {
		const user = await makeUser()
		const team = await makeTeam()
		const flair = await teamFlair(team.id)
		await db
			.update(users)
			.set({ equippedFlairId: flair.id })
			.where(eq(users.id, user.id))

		const data = await expectData<{ unequipFlair: FlairUserResult }>(UNEQUIP, {
			as: user,
		})

		expect(data.unequipFlair.__typename).toBe("User")
		expect(data.unequipFlair.equippedFlair).toBeNull()
	})
})

describe("myFlairs", () => {
	it("lists every open flair and the viewer's own grants, and nobody else's", async () => {
		const user = await makeUser()
		const other = await makeUser()
		const team = await makeTeam()
		const open = await teamFlair(team.id)
		const mine = await makeFlair()
		const theirs = await makeFlair()
		const retired = await makeFlair({ status: "retired" })

		await db.insert(userFlairs).values([
			{ userId: user.id, flairId: mine.id },
			{ userId: other.id, flairId: theirs.id },
			{ userId: user.id, flairId: retired.id },
		])

		const data = await expectData<{ myFlairs: FlairChip[] }>(MY_FLAIRS, {
			as: user,
		})
		const ids = data.myFlairs.map((f) => f.id)

		expect(ids).toContain(open.id)
		expect(ids).toContain(mine.id)
		expect(ids).not.toContain(theirs.id)
		expect(ids).not.toContain(retired.id)
	})

	it("is empty for a signed-out viewer", async () => {
		const team = await makeTeam()
		await teamFlair(team.id)

		const data = await expectData<{ myFlairs: FlairChip[] }>(MY_FLAIRS, {})

		expect(data.myFlairs).toEqual([])
	})

	// The whole reason a team flair stores no display columns: the team row
	// stays the single source, so a rebrand or a color correction from the
	// ESPN sync reaches every chip without touching the flair.
	it("reads a team flair's display fields live off the team", async () => {
		const user = await makeUser()
		const team = await makeTeam({
			name: "Boston Celtics",
			abbreviation: "BOS",
			color: "#007A33",
		})
		await teamFlair(team.id)

		await db
			.update(teams)
			.set({ name: "Boston Rebrand", abbreviation: "BRE", color: "#112233" })
			.where(eq(teams.id, team.id))

		const data = await expectData<{ myFlairs: FlairChip[] }>(MY_FLAIRS, {
			as: user,
		})
		const flair = data.myFlairs[0]

		expect(flair.label).toBe("Boston Rebrand")
		expect(flair.icon).toBe("BRE")
		expect(flair.color).toBe("#112233")
	})
})

describe("grantFlair / revokeFlair", () => {
	it("grants, and granting twice leaves one row", async () => {
		const admin = await makeAdmin()
		const user = await makeUser()
		const flair = await makeFlair()

		await expectData<{ grantFlair: FlairUserResult }>(GRANT, {
			as: admin,
			variables: { userId: user.id, flairId: flair.id },
		})
		const data = await expectData<{ grantFlair: FlairUserResult }>(GRANT, {
			as: admin,
			variables: { userId: user.id, flairId: flair.id },
		})

		expect(data.grantFlair.__typename).toBe("User")
		expect(data.grantFlair.grantedFlairs).toHaveLength(1)
	})

	it("refuses to grant an open flair, which everyone already has", async () => {
		const admin = await makeAdmin()
		const user = await makeUser()
		const team = await makeTeam()
		const flair = await teamFlair(team.id)

		const data = await expectData<{ grantFlair: FlairUserResult }>(GRANT, {
			as: admin,
			variables: { userId: user.id, flairId: flair.id },
		})

		expect(data.grantFlair.__typename).toBe("ValidationError")
	})

	it("refuses a non-admin", async () => {
		const user = await makeUser()
		const flair = await makeFlair()

		const data = await expectData<{ grantFlair: FlairUserResult }>(GRANT, {
			as: user,
			variables: { userId: user.id, flairId: flair.id },
		})

		expect(data.grantFlair.__typename).toBe("AuthorizationError")
	})

	it("unequips the flair it revokes", async () => {
		const admin = await makeAdmin()
		const user = await makeUser()
		const flair = await makeFlair()
		await db.insert(userFlairs).values({ userId: user.id, flairId: flair.id })
		await db
			.update(users)
			.set({ equippedFlairId: flair.id })
			.where(eq(users.id, user.id))

		const data = await expectData<{ revokeFlair: FlairUserResult }>(REVOKE, {
			as: admin,
			variables: { userId: user.id, flairId: flair.id },
		})

		expect(data.revokeFlair.__typename).toBe("User")
		expect(data.revokeFlair.equippedFlair).toBeNull()
		expect(data.revokeFlair.grantedFlairs).toHaveLength(0)
	})

	it("leaves a different equipped flair alone when revoking", async () => {
		const admin = await makeAdmin()
		const user = await makeUser()
		const team = await makeTeam()
		const worn = await teamFlair(team.id)
		const revoked = await makeFlair()
		await db.insert(userFlairs).values({ userId: user.id, flairId: revoked.id })
		await db
			.update(users)
			.set({ equippedFlairId: worn.id })
			.where(eq(users.id, user.id))

		const data = await expectData<{ revokeFlair: FlairUserResult }>(REVOKE, {
			as: admin,
			variables: { userId: user.id, flairId: revoked.id },
		})

		expect(data.revokeFlair.equippedFlair?.id).toBe(worn.id)
	})
})

describe("errors", () => {
	it("returns NotFoundError for a flair that doesn't exist", async () => {
		const user = await makeUser()

		const result = await execute(EQUIP, {
			as: user,
			variables: { flairId: "00000000-0000-0000-0000-000000000000" },
		})

		expect(result.errors).toBeUndefined()
		expect(
			(result.data as { equipFlair: { __typename: string } }).equipFlair
				.__typename,
		).toBe("NotFoundError")
	})
})
