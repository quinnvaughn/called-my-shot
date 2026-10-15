import { REDO_BALANCE_CAP } from "@called-my-shot/scoring"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { StatLine } from "#/components/invite/stat-line"
import { Card } from "#/components/ui/card"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { Eyebrow } from "#/components/ui/eyebrow"
import { PageHeader } from "#/components/ui/page-header"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { invitePageQuery } from "#/graphql/invite/queries"
import { track } from "#/lib/analytics"
import { pageMeta, SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

export const Route = createFileRoute("/_app/_authed/invite")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(invitePageQuery()),
	head: () =>
		pageMeta({
			title: "Invite a friend",
			description: "Earn redos by bringing people in.",
			path: "/invite",
		}),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(invitePageQuery())
	const me = data.me
	const code = me?.referralCode
	const balance = me?.redoBalance ?? 0
	const stats = me?.referralStats

	if (!code) return null

	const url = `${SITE_ORIGIN}/join/${code}`
	const displayUrl = `${SITE_HOST}/join/${code}`

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<PageHeader
				title="Invite a friend"
				subtitle="They get a redo the moment they sign up. You get one when they make their first call."
			/>

			{/* The count is the whole of what this card said. Its body used to
			explain what a redo is, which is the one thing someone opening
			their own invite page already knows. */}
			<Card size="md">
				<Card.Header>
					<Eyebrow size="sm" variant="neutral">
						Your redos
					</Eyebrow>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
						})}
					>
						{balance} of {REDO_BALANCE_CAP}
					</span>
				</Card.Header>
				{balance >= REDO_BALANCE_CAP && (
					<Card.Body>
						<p
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
							})}
						>
							Full. Anything you earn now is held until you spend one.
						</p>
					</Card.Body>
				)}
			</Card>

			<Card size="md">
				<Card.Header>
					<Eyebrow size="sm" variant="neutral">
						Your link
					</Eyebrow>
				</Card.Header>
				<Card.Body>
					<VStack gap="4" alignItems="stretch">
						<CopyLinkRow
							url={url}
							displayUrl={displayUrl}
							shareTitle="Called My Shot"
							onCopied={() =>
								track("referral_link_shared", {
									method: "clipboard",
									surface: "invite_page",
								})
							}
							onNativeShared={() =>
								track("referral_link_shared", {
									method: "native",
									surface: "invite_page",
								})
							}
						/>
						<PostOnXLink
							text="Calling games before they happen. Sign up with my link and we both get a redo."
							url={url}
							onClick={() =>
								track("referral_link_shared", {
									method: "x",
									surface: "invite_page",
								})
							}
						/>
						<p
							className={css({
								textStyle: "metaSm",
								color: "fg.subtle",
							})}
						>
							Or the code alone: <b>{code}</b>
						</p>
					</VStack>
				</Card.Body>
			</Card>

			{stats && stats.invited > 0 && (
				<Card size="md">
					<Card.Header>
						<Eyebrow size="sm" variant="neutral">
							Your invites
						</Eyebrow>
					</Card.Header>
					<Card.Body>
						<VStack gap="3" alignItems="stretch">
							<StatLine
								label="Signed up"
								value={`${stats.invited} ${pluralize(stats.invited, "person", "people")}`}
							/>
							<StatLine label="Made a call" value={String(stats.called)} />
							{stats.waiting > 0 && (
								<StatLine
									label="Waiting for room"
									value={`${stats.waiting} ${pluralize(stats.waiting, "redo", "redos")}`}
								/>
							)}
						</VStack>
					</Card.Body>
				</Card>
			)}
		</VStack>
	)
}
