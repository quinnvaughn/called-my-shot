import type { ReferralPreviewQuery } from "#/graphql/generated/graphql"

export type ReferralInviter = NonNullable<
	ReferralPreviewQuery["referralPreview"]
>["inviter"]
