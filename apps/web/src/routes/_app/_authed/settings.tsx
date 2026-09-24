import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { DangerZone } from "#/components/settings/danger-zone"
import { EmailNotificationsSection } from "#/components/settings/email-notifications-section"
import { EmailSection } from "#/components/settings/email-section"
import { FlairSection } from "#/components/settings/flair-section"
import { PasswordSection } from "#/components/settings/password-section"
import { ProfileImagesSection } from "#/components/settings/profile-images-section"
import { UsernameSection } from "#/components/settings/username-section"
import { PageHeader } from "#/components/ui/page-header"
import { SettingsPageDocument } from "#/graphql/queries/user"
import { gqlQueryOptions } from "#/graphql/query-options"
import { toFlair } from "#/lib/identity"

const settingsQuery = gqlQueryOptions(SettingsPageDocument, {})

export const Route = createFileRoute("/_app/_authed/settings")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(settingsQuery),
})

function sectionLabel(text: string) {
	return (
		<h2
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				color: "fg.muted",
				textTransform: "uppercase",
			})}
		>
			{text}
		</h2>
	)
}

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
				{sectionLabel("Avatar and banner")}
				<ProfileImagesSection
					name={me.name}
					avatarUrl={me.avatarUrl ?? null}
					bannerUrl={me.bannerUrl ?? null}
				/>
			</VStack>
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Username")}
				<UsernameSection username={me.username} />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Flair")}
				<FlairSection
					flair={toFlair(me.equippedFlair)}
					flairId={me.equippedFlair?.id ?? null}
				/>
			</VStack>
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Email")}
				<EmailSection
					email={me.email ?? ""}
					emailVerified={me.emailVerified}
					pendingEmailChange={me.pendingEmailChange ?? null}
				/>
			</VStack>
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Email notifications")}
				<EmailNotificationsSection mutedEmailTypes={me.mutedEmailTypes ?? []} />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Password")}
				<PasswordSection />
			</VStack>
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Danger zone")}
				<DangerZone username={me.username} />
			</VStack>
		</VStack>
	)
}
