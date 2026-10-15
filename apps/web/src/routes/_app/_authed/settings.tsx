import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { BlockedUsersSection } from "#/components/settings/blocked-users-section"
import { DangerZone } from "#/components/settings/danger-zone"
import { EmailNotificationsSection } from "#/components/settings/email-notifications-section"
import { EmailSection } from "#/components/settings/email-section"
import { FavoriteTeamsSection } from "#/components/settings/favorite-teams-section"
import { FlairSection } from "#/components/settings/flair-section"
import { PasswordSection } from "#/components/settings/password-section"
import { ProfileImagesSection } from "#/components/settings/profile-images-section"
import { PushNotificationsSection } from "#/components/settings/push-notifications-section"
import { UsernameSection } from "#/components/settings/username-section"
import { WalkthroughSection } from "#/components/settings/walkthrough-section"
import { PageHeader } from "#/components/ui/page-header"
import { SectionLabel } from "#/components/ui/section-label"
import { gqlQueryOptions } from "#/graphql/query-options"
import { SettingsPageDocument } from "#/graphql/user/settings/queries"
import { toFlair } from "#/lib/identity"

const settingsQuery = gqlQueryOptions(SettingsPageDocument, {})

export const Route = createFileRoute("/_app/_authed/settings")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(settingsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(settingsQuery)
	const me = data.me
	// _authed's beforeLoad already redirects guests to "/" before this ever
	// renders - me is only null for an instant during that redirect.
	if (!me) return null

	return (
		<VStack alignItems="stretch" gap="8" maxWidth="xl">
			<PageHeader
				title="Settings"
				subtitle="Manage your login and account-level preferences"
			/>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Avatar and banner</SectionLabel>
				<ProfileImagesSection
					name={me.name}
					avatarUrl={me.avatarUrl ?? null}
					bannerUrl={me.bannerUrl ?? null}
				/>
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Username</SectionLabel>
				<UsernameSection username={me.username} />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Teams</SectionLabel>
				<FavoriteTeamsSection teams={me.favoriteTeams} />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Flair</SectionLabel>
				<FlairSection
					flair={toFlair(me.equippedFlair)}
					flairId={me.equippedFlair?.id ?? null}
				/>
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Email</SectionLabel>
				<EmailSection
					email={me.email ?? ""}
					emailVerified={me.emailVerified}
					pendingEmailChange={me.pendingEmailChange ?? null}
					hasPassword={me.hasPassword ?? true}
				/>
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Email notifications</SectionLabel>
				<EmailNotificationsSection mutedEmailTypes={me.mutedEmailTypes ?? []} />
			</VStack>
			<PushNotificationsSection
				label={<SectionLabel>Push notifications</SectionLabel>}
				mutedPushTypes={me.mutedPushTypes ?? []}
			/>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Password</SectionLabel>
				<PasswordSection hasPassword={me.hasPassword ?? true} />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Walkthrough</SectionLabel>
				<WalkthroughSection />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Blocked</SectionLabel>
				<BlockedUsersSection />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Danger zone</SectionLabel>
				<DangerZone
					username={me.username}
					hasPassword={me.hasPassword ?? true}
				/>
			</VStack>
		</VStack>
	)
}
