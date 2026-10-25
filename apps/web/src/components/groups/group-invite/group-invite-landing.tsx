import { useMemo } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PageBanner } from "#/components/images/page-banner"
import { GroupCallDemo } from "#/components/landing-page/group-call-demo/group-call-demo"
import { LandingPageFooter } from "#/components/landing-page/landing-page-footer"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { CallCard } from "#/components/questions/call-card"
import { Avatar } from "#/components/ui/avatar"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Button } from "#/components/ui/button"
import { CardRail } from "#/components/ui/card-rail"
import { Eyebrow } from "#/components/ui/eyebrow"
import { GroupLogo } from "#/components/ui/group-logo"
import { pluralize } from "#/lib/pluralize"
import { GroupInviteJoinBar } from "../group-invite-join-bar"
import { GroupInviteLeaders } from "./group-invite-leaders"
import { GroupInviteNav } from "./group-invite-nav"
import { GroupInviteWeek } from "./group-invite-week"
import { inviteDemoCast } from "./invite-demo-cast"
import { leaguesLabel } from "./leagues-label"
import type { GroupPreview } from "./types"

type Props = {
	preview: GroupPreview
	onJoin: () => void
	joining: boolean
}

const freeNote = (
	<p
		className={css({
			color: "fg.subtle",
			textStyle: "metaLg",
			textAlign: "center",
		})}
	>
		free · no money, ever · takes 30 seconds
	</p>
)

// The invite page for someone without an account, who likely doesn't know the
// site yet. Out of the app shell: who invited them and to what, a demo of a
// call playing out in this group, then the group's real board and calls.
export function GroupInviteLanding({ preview, onJoin, joining }: Props) {
	const inviter = preview.invitedBy.username !== "" ? preview.invitedBy : null
	const demoCast = useMemo(() => inviteDemoCast(preview), [preview])

	return (
		// Clipped so the banner and the join bar's full-bleed backdrop (100vw)
		// can't push a horizontal scrollbar onto the page.
		<div
			className={css({
				minHeight: "100dvh",
				bg: "bg.canvas",
				overflowX: "clip",
			})}
		>
			<GroupInviteNav />
			{preview.bannerUrl && <PageBanner bannerUrl={preview.bannerUrl} />}
			<section className={css({ paddingBlock: { base: "8", sm: "14" } })}>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
						gap: { base: "12", lg: "10" },
						alignItems: "flex-start",
					})}
				>
					<VStack alignItems="flex-start" gap="5">
						{inviter ? (
							<HStack gap="2.5">
								<Avatar name={inviter.name} src={inviter.avatarUrl} size="sm" />
								<Eyebrow variant="neutral">
									@{inviter.username} invited you
								</Eyebrow>
							</HStack>
						) : (
							<Eyebrow variant="neutral">
								You've been invited to a group
							</Eyebrow>
						)}
						<HStack gap="4">
							<GroupLogo size="lg" name={preview.name} src={preview.logoUrl} />
							<h1
								className={css({
									fontFamily: "heading",
									fontSize: { base: "3xl", lg: "5xl" },
									lineHeight: "1",
									overflowWrap: "anywhere",
								})}
							>
								{preview.name}
							</h1>
						</HStack>
						{preview.description && (
							<p
								className={css({
									lineHeight: "relaxed",
									color: "fg.body",
									maxWidth: "lg",
								})}
							>
								{preview.description}
							</p>
						)}
						<HStack gap="3" flexWrap="wrap">
							<AvatarStack members={preview.members} />
							<p className={css({ textStyle: "metaLg", color: "fg.muted" })}>
								{preview.memberCount} {pluralize(preview.memberCount, "member")}{" "}
								· {leaguesLabel(preview.trackedLeagues)}
							</p>
						</HStack>
						<p
							className={css({
								lineHeight: "relaxed",
								color: "fg.body",
								maxWidth: "lg",
							})}
						>
							Everyone in {preview.name} makes calls on the same games, and the
							group's leaderboard keeps score all season.
						</p>
						{/* Below lg the pinned bar at the end of the page does this. */}
						<VStack
							alignItems="stretch"
							gap="2"
							className={css({
								display: { base: "none", lg: "flex" },
								width: "full",
								maxWidth: "sm",
							})}
						>
							<Button
								variant="solid"
								size="lg"
								fullWidth
								onClick={onJoin}
								loading={joining}
							>
								Join {preview.name}
							</Button>
							{freeNote}
						</VStack>
					</VStack>
					<VStack alignItems="stretch" gap="3">
						<Eyebrow variant="neutral">
							How a call plays out in {preview.name}
						</Eyebrow>
						<GroupCallDemo cast={demoCast} />
					</VStack>
				</LandingPageWrap>
			</section>
			{(preview.leaders.length > 0 || preview.recentCalls.length > 0) && (
				<section className={css({ paddingBottom: { base: "8", sm: "14" } })}>
					<LandingPageWrap
						className={css({
							display: "grid",
							gridTemplateColumns: { base: "1fr", lg: "2fr 3fr" },
							gap: { base: "10", lg: "10" },
							alignItems: "flex-start",
						})}
					>
						{preview.leaders.length > 0 && (
							<GroupInviteLeaders leaders={preview.leaders} />
						)}
						{preview.recentCalls.length > 0 && (
							// Unlinked: clicking through would leave the invite behind
							// before the visitor has joined.
							<CardRail
								items={preview.recentCalls}
								getKey={(call) => call.id}
								renderItem={(call) => <CallCard call={call} linked={false} />}
								itemLabel="call"
								header={
									<Eyebrow variant="neutral">Latest calls in the group</Eyebrow>
								}
							/>
						)}
					</LandingPageWrap>
				</section>
			)}
			<GroupInviteWeek groupName={preview.name} />
			<LandingPageFooter />
			<GroupInviteJoinBar
				groupName={preview.name}
				onJoin={onJoin}
				joining={joining}
				freeNote={freeNote}
			/>
		</div>
	)
}
