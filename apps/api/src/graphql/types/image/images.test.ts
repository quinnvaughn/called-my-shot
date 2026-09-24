import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../../db"
import { groups } from "../../../db/schema"
import { hashPassword } from "../../../lib/password"
import { deleteImage, headImage, presignImagePut } from "../../../lib/storage"
import { makeGroup, makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// R2 itself is faked: these tests are about who may upload where and what
// gets attached, not about the S3 wire protocol.
vi.mock("../../../lib/storage", () => ({
	isStorageConfigured: () => true,
	imageUrl: (key: string | null | undefined) =>
		key ? `https://images.test/${key}` : null,
	presignImagePut: vi.fn(async (key: string) => ({
		url: `https://r2.test/${key}?signed`,
		headers: [{ name: "Content-Type", value: "image/webp" }],
	})),
	headImage: vi.fn(async () => ({
		contentType: "image/webp",
		contentLength: 40_000,
	})),
	deleteImage: vi.fn(async () => {}),
}))

beforeEach(() => {
	vi.clearAllMocks()
})

const CREATE_UPLOAD = /* GraphQL */ `
	mutation CreateUpload($input: CreateImageUploadInput!) {
		createImageUpload(input: $input) {
			__typename
			... on ImageUpload { key uploadUrl headers { name value } }
			... on Error { message }
		}
	}
`

const SET_MY_IMAGE = /* GraphQL */ `
	mutation SetMyImage($input: SetMyImageInput!) {
		setMyImage(input: $input) {
			__typename
			... on User { avatarUrl bannerUrl }
			... on Error { message }
		}
	}
`

const REMOVE_MY_IMAGE = /* GraphQL */ `
	mutation RemoveMyImage($input: RemoveMyImageInput!) {
		removeMyImage(input: $input) {
			__typename
			... on User { avatarUrl bannerUrl }
		}
	}
`

const SET_GROUP_IMAGE = /* GraphQL */ `
	mutation SetGroupImage($input: SetGroupImageInput!) {
		setGroupImage(input: $input) {
			__typename
			... on GroupPayload { group { logoUrl bannerUrl } }
			... on Error { message }
		}
	}
`

const REMOVE_GROUP_IMAGE = /* GraphQL */ `
	mutation RemoveGroupImage($input: RemoveGroupImageInput!) {
		removeGroupImage(input: $input) {
			__typename
			... on GroupPayload { group { logoUrl bannerUrl } }
			... on Error { message }
		}
	}
`

type UploadResult = {
	createImageUpload:
		| {
				__typename: "ImageUpload"
				key: string
				uploadUrl: string
				headers: { name: string; value: string }[]
		  }
		| ErrorResult
}
type MyImageResult = {
	setMyImage:
		| {
				__typename: "User"
				avatarUrl: string | null
				bannerUrl: string | null
		  }
		| ErrorResult
}
type GroupImageResult = {
	setGroupImage:
		| {
				__typename: "GroupPayload"
				group: { logoUrl: string | null; bannerUrl: string | null }
		  }
		| ErrorResult
}

const upload = { contentType: "image/webp", contentLength: 40_000 }

async function requestKey(
	as: Awaited<ReturnType<typeof makeUser>>,
	input: Record<string, unknown>,
): Promise<string> {
	const data = await expectData<UploadResult>(CREATE_UPLOAD, {
		as,
		variables: { input: { ...upload, ...input } },
	})
	if (data.createImageUpload.__typename !== "ImageUpload") {
		throw new Error(`upload refused: ${data.createImageUpload.__typename}`)
	}
	return (data.createImageUpload as { key: string }).key
}

describe("createImageUpload", () => {
	it("issues a fresh key under the viewer's own avatar prefix", async () => {
		const user = await makeUser()

		const data = await expectData<UploadResult>(CREATE_UPLOAD, {
			as: user,
			variables: { input: { kind: "AVATAR", ...upload } },
		})

		expect(data.createImageUpload).toMatchObject({
			__typename: "ImageUpload",
			key: expect.stringMatching(
				new RegExp(`^avatars/${user.id}/[0-9a-f-]{36}\\.webp$`),
			),
			headers: [{ name: "Content-Type", value: "image/webp" }],
		})
		expect(presignImagePut).toHaveBeenCalledWith(
			expect.any(String),
			"image/webp",
			40_000,
		)
	})

	it("names JPEGs .jpg", async () => {
		const user = await makeUser()
		const key = await requestKey(user, {
			kind: "AVATAR",
			contentType: "image/jpeg",
		})
		expect(key).toMatch(/\.jpg$/)
	})

	it("refuses anything but WebP or JPEG, and anything over 2 MB", async () => {
		const user = await makeUser()

		const png = await expectData<UploadResult>(CREATE_UPLOAD, {
			as: user,
			variables: {
				input: { kind: "AVATAR", ...upload, contentType: "image/png" },
			},
		})
		const huge = await expectData<UploadResult>(CREATE_UPLOAD, {
			as: user,
			variables: {
				input: { kind: "AVATAR", ...upload, contentLength: 3 * 1024 * 1024 },
			},
		})

		expect(png.createImageUpload.__typename).toBe("ValidationError")
		expect(huge.createImageUpload.__typename).toBe("ValidationError")
		expect(presignImagePut).not.toHaveBeenCalled()
	})

	it("needs a group for group kinds", async () => {
		const user = await makeUser()

		const data = await expectData<UploadResult>(CREATE_UPLOAD, {
			as: user,
			variables: { input: { kind: "GROUP_LOGO", ...upload } },
		})

		expect(data.createImageUpload.__typename).toBe("ValidationError")
	})

	it("only lets a group's admins upload its images", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin, members: [member] })

		const asMember = await expectData<UploadResult>(CREATE_UPLOAD, {
			as: member,
			variables: {
				input: { kind: "GROUP_BANNER", groupId: group.id, ...upload },
			},
		})
		const key = await requestKey(admin, {
			kind: "GROUP_BANNER",
			groupId: group.id,
		})

		expect(asMember.createImageUpload.__typename).toBe("AuthorizationError")
		expect(key).toMatch(new RegExp(`^groups/${group.id}/banner/`))
	})
})

describe("avatars", () => {
	it("attaches an uploaded key and serves it", async () => {
		const user = await makeUser()
		const key = await requestKey(user, { kind: "AVATAR" })

		const data = await expectData<MyImageResult>(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "AVATAR", key } },
		})

		expect(data.setMyImage).toEqual({
			__typename: "User",
			avatarUrl: `https://images.test/${key}`,
			bannerUrl: null,
		})
	})

	it("refuses someone else's key", async () => {
		const owner = await makeUser()
		const thief = await makeUser()
		const key = await requestKey(owner, { kind: "AVATAR" })

		const data = await expectData<MyImageResult>(SET_MY_IMAGE, {
			as: thief,
			variables: { input: { kind: "AVATAR", key } },
		})

		expect(data.setMyImage.__typename).toBe("ValidationError")
		expect(headImage).not.toHaveBeenCalled()
	})

	it("refuses a key that was never uploaded", async () => {
		const user = await makeUser()
		const key = await requestKey(user, { kind: "AVATAR" })
		vi.mocked(headImage).mockResolvedValueOnce(null)

		const data = await expectData<MyImageResult>(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "AVATAR", key } },
		})

		expect(data.setMyImage).toMatchObject({
			__typename: "ValidationError",
			message: "The upload didn't finish. Try again.",
		})
		const row = await db.query.users.findFirst({ where: { id: user.id } })
		expect(row?.avatarKey).toBeNull()
	})

	it("refuses an object that isn't what was agreed", async () => {
		const user = await makeUser()
		const key = await requestKey(user, { kind: "AVATAR" })
		vi.mocked(headImage).mockResolvedValueOnce({
			contentType: "text/html",
			contentLength: 100,
		})

		const data = await expectData<MyImageResult>(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "AVATAR", key } },
		})

		expect(data.setMyImage.__typename).toBe("ValidationError")
	})

	it("deletes the avatar it replaces, and the last one on removal", async () => {
		const user = await makeUser()
		const first = await requestKey(user, { kind: "AVATAR" })
		const second = await requestKey(user, { kind: "AVATAR" })

		await expectData(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "AVATAR", key: first } },
		})
		expect(deleteImage).toHaveBeenLastCalledWith(null)
		await expectData(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "AVATAR", key: second } },
		})
		expect(deleteImage).toHaveBeenLastCalledWith(first)

		const removed = await expectData<{
			removeMyImage: { avatarUrl: string | null }
		}>(REMOVE_MY_IMAGE, { as: user, variables: { input: { kind: "AVATAR" } } })

		expect(removed.removeMyImage.avatarUrl).toBeNull()
		expect(deleteImage).toHaveBeenLastCalledWith(second)
	})
})

describe("profile banners", () => {
	it("keeps the banner separate from the avatar", async () => {
		const user = await makeUser()
		const avatar = await requestKey(user, { kind: "AVATAR" })
		const banner = await requestKey(user, { kind: "USER_BANNER" })

		expect(banner).toMatch(new RegExp(`^users/${user.id}/banner/`))
		await expectData(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "AVATAR", key: avatar } },
		})
		const data = await expectData<MyImageResult>(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "BANNER", key: banner } },
		})

		expect(data.setMyImage).toEqual({
			__typename: "User",
			avatarUrl: `https://images.test/${avatar}`,
			bannerUrl: `https://images.test/${banner}`,
		})
	})

	it("won't put an avatar key in the banner slot", async () => {
		const user = await makeUser()
		const avatar = await requestKey(user, { kind: "AVATAR" })

		const data = await expectData<MyImageResult>(SET_MY_IMAGE, {
			as: user,
			variables: { input: { kind: "BANNER", key: avatar } },
		})

		expect(data.setMyImage.__typename).toBe("ValidationError")
	})
})

describe("group images", () => {
	it("sets the logo and banner independently", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const logo = await requestKey(admin, {
			kind: "GROUP_LOGO",
			groupId: group.id,
		})
		const banner = await requestKey(admin, {
			kind: "GROUP_BANNER",
			groupId: group.id,
		})

		await expectData(SET_GROUP_IMAGE, {
			as: admin,
			variables: { input: { groupId: group.id, kind: "LOGO", key: logo } },
		})
		const data = await expectData<GroupImageResult>(SET_GROUP_IMAGE, {
			as: admin,
			variables: { input: { groupId: group.id, kind: "BANNER", key: banner } },
		})

		expect(data.setGroupImage).toEqual({
			__typename: "GroupPayload",
			group: {
				logoUrl: `https://images.test/${logo}`,
				bannerUrl: `https://images.test/${banner}`,
			},
		})
	})

	it("won't put a logo key in the banner slot", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const logo = await requestKey(admin, {
			kind: "GROUP_LOGO",
			groupId: group.id,
		})

		const data = await expectData<GroupImageResult>(SET_GROUP_IMAGE, {
			as: admin,
			variables: { input: { groupId: group.id, kind: "BANNER", key: logo } },
		})

		expect(data.setGroupImage.__typename).toBe("ValidationError")
	})

	it("won't take another group's key", async () => {
		const admin = await makeUser()
		const mine = await makeGroup({ admin })
		const theirs = await makeGroup({ admin })
		const key = await requestKey(admin, {
			kind: "GROUP_LOGO",
			groupId: theirs.id,
		})

		const data = await expectData<GroupImageResult>(SET_GROUP_IMAGE, {
			as: admin,
			variables: { input: { groupId: mine.id, kind: "LOGO", key } },
		})

		expect(data.setGroupImage.__typename).toBe("ValidationError")
	})

	it("only lets admins set or remove them", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin, members: [member] })
		const key = await requestKey(admin, {
			kind: "GROUP_LOGO",
			groupId: group.id,
		})

		const set = await expectData<GroupImageResult>(SET_GROUP_IMAGE, {
			as: member,
			variables: { input: { groupId: group.id, kind: "LOGO", key } },
		})
		const removed = await expectData<{
			removeGroupImage: ErrorResult
		}>(REMOVE_GROUP_IMAGE, {
			as: member,
			variables: { input: { groupId: group.id, kind: "LOGO" } },
		})

		expect(set.setGroupImage.__typename).toBe("AuthorizationError")
		expect(removed.removeGroupImage.__typename).toBe("AuthorizationError")
	})

	it("removes one slot and deletes its object", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		await db
			.update(groups)
			.set({
				logoKey: `groups/${group.id}/logo/a.webp`,
				bannerKey: `groups/${group.id}/banner/b.webp`,
			})
			.where(eq(groups.id, group.id))

		const data = await expectData<{
			removeGroupImage: {
				group: { logoUrl: string | null; bannerUrl: string | null }
			}
		}>(REMOVE_GROUP_IMAGE, {
			as: admin,
			variables: { input: { groupId: group.id, kind: "LOGO" } },
		})

		expect(data.removeGroupImage.group).toEqual({
			logoUrl: null,
			bannerUrl: `https://images.test/groups/${group.id}/banner/b.webp`,
		})
		expect(deleteImage).toHaveBeenCalledWith(`groups/${group.id}/logo/a.webp`)
	})
})

describe("cleanup on delete", () => {
	it("deletes a group's images with the group", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		await db
			.update(groups)
			.set({ logoKey: "logo-key", bannerKey: "banner-key" })
			.where(eq(groups.id, group.id))

		await expectData(
			/* GraphQL */ `
				mutation Delete($groupId: ID!) {
					deleteGroup(groupId: $groupId) { __typename }
				}
			`,
			{ as: admin, variables: { groupId: group.id } },
		)

		expect(deleteImage).toHaveBeenCalledWith("logo-key")
		expect(deleteImage).toHaveBeenCalledWith("banner-key")
	})

	it("deletes the images when the last member leaves", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		await db
			.update(groups)
			.set({ logoKey: "logo-key" })
			.where(eq(groups.id, group.id))

		await expectData(
			/* GraphQL */ `
				mutation Leave($groupId: ID!) {
					leaveGroup(groupId: $groupId) { __typename }
				}
			`,
			{ as: admin, variables: { groupId: group.id } },
		)

		expect(deleteImage).toHaveBeenCalledWith("logo-key")
	})

	it("keeps the images when someone else is still in the group", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin, members: [member] })
		await db
			.update(groups)
			.set({ logoKey: "logo-key" })
			.where(eq(groups.id, group.id))

		await expectData(
			/* GraphQL */ `
				mutation Leave($groupId: ID!) {
					leaveGroup(groupId: $groupId) { __typename }
				}
			`,
			{ as: admin, variables: { groupId: group.id } },
		)

		expect(deleteImage).not.toHaveBeenCalledWith("logo-key")
	})

	it("deletes an account's avatar and banner with the account", async () => {
		const user = await makeUser({
			avatarKey: "avatars/x/y.webp",
			bannerKey: "users/x/banner/z.webp",
			passwordHash: await hashPassword("password123"),
		})

		await expectData(
			/* GraphQL */ `
				mutation DeleteAccount($input: DeleteAccountInput!) {
					deleteAccount(input: $input) { __typename }
				}
			`,
			{ as: user, variables: { input: { password: "password123" } } },
		)

		expect(deleteImage).toHaveBeenCalledWith("avatars/x/y.webp")
		expect(deleteImage).toHaveBeenCalledWith("users/x/banner/z.webp")
	})
})
