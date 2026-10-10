import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Identity } from "#/components/ui/identity"
import { ShareIconRow } from "#/components/ui/share-icon-row"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { track } from "#/lib/analytics"
import { toIdentity } from "#/lib/identity"
import { SITE_ORIGIN } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

export const GroupRecapCardFragment = graphql(`
	fragment GroupRecapCard_recap on GroupRecap {
		id
		weekLabel
		shareToken
		record {
			wins
			losses
			activeMembers
			accuracy
		}
		tiles {
			kind
			label
			value
			tone
			headline
			note
			leagueAbbr
			callId
			user {
				id
				...Identity_user
			}
		}
		climber {
			from
			to
			user {
				id
				...Identity_user
			}
		}
		slide {
			from
			to
			user {
				id
				...Identity_user
			}
		}
	}
`)

export function recapPath(shareToken: string): string {
	return `/recaps/${shareToken}`
}

type Props = {
	recap: FragmentType<typeof GroupRecapCardFragment>
	groupName: string
}

// A group's week: the record across the top, its slots below, then who moved
// on the season board. Used on the group's Home tab while the recap is fresh
// and on the recap's own public page. The share row only shows while the
// group allows recap links.
export function GroupRecapCard({ recap: recapProp, groupName }: Props) {
	const recap = useFragment(GroupRecapCardFragment, recapProp)
	const { wins, losses, activeMembers, accuracy } = recap.record
	const share = recap.shareToken
	const movers = [
		recap.climber && { kind: "climber" as const, ...recap.climber },
		recap.slide && { kind: "slide" as const, ...recap.slide },
	].filter((m) => m !== null)

	return (
		<Card>
			<Card.Header>
				<VStack alignItems="flex-start" gap="1">
					<Eyebrow variant="neutral">Weekly recap · {recap.weekLabel}</Eyebrow>
					<span className={css({ fontSize: "sm", color: "fg.muted" })}>
						{wins}–{losses}
						{accuracy !== null && ` · ${accuracy}% hit rate`} · {activeMembers}{" "}
						{pluralize(activeMembers, "member")} called
					</span>
				</VStack>
				{share && (
					<ShareIconRow
						url={`${SITE_ORIGIN}${recapPath(share)}`}
						campaign="recap"
						shareTitle={`${groupName} · ${recap.weekLabel}`}
						onShared={(method) =>
							track("recap_link_shared", { recapId: recap.id, method })
						}
					/>
				)}
			</Card.Header>
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					{recap.tiles.length > 0 && (
						<Grid columns={{ base: 1, md: 2 }} gap="3">
							{recap.tiles.map((tile) => (
								<VStack
									// Tied best or worst calls share a kind, each with its own call.
									key={`${tile.kind}-${tile.callId ?? ""}`}
									alignItems="flex-start"
									gap="2"
									className={css({
										padding: "4",
										borderRadius: "xl",
										bg: "bg.subtle",
										minWidth: "0",
									})}
								>
									<Eyebrow variant="neutral" size="sm">
										{tile.label} · {tile.leagueAbbr}
									</Eyebrow>
									{tile.user ? (
										<Identity size="sm" {...toIdentity(tile.user)} />
									) : (
										<span className={css({ fontWeight: "semibold" })}>
											The group
										</span>
									)}
									<span
										className={css({
											fontFamily: "heading",
											fontSize: "2xl",
											lineHeight: "1.1",
											color:
												tile.tone === "SUCCESS"
													? "success.default"
													: tile.tone === "DANGER"
														? "danger.default"
														: "fg.default",
										})}
									>
										{tile.value}
									</span>
									{tile.callId ? (
										<Link
											to="/calls/$callId"
											params={{ callId: tile.callId }}
											className={css({
												fontSize: "sm",
												color: "fg.body",
												_hover: { textDecoration: "underline" },
											})}
										>
											{tile.headline}
										</Link>
									) : (
										<span className={css({ fontSize: "sm", color: "fg.body" })}>
											{tile.headline}
										</span>
									)}
									<span className={css({ fontSize: "xs", color: "fg.muted" })}>
										{tile.note}
									</span>
								</VStack>
							))}
						</Grid>
					)}
					{movers.length > 0 && (
						<HStack gap="6" flexWrap="wrap">
							{movers.map((m) => (
								<HStack key={m.kind} gap="2" alignItems="center">
									<Eyebrow variant="secondary" size="sm">
										{m.kind === "climber" ? "Climber" : "Slide"}
									</Eyebrow>
									<Identity size="xs" {...toIdentity(m.user)} />
									<span className={css({ fontSize: "sm", color: "fg.muted" })}>
										{m.kind === "climber" ? "up" : "down"}{" "}
										{Math.abs(m.from - m.to)} to #{m.to}
									</span>
								</HStack>
							))}
						</HStack>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}
