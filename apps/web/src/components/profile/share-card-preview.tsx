import { DateTime } from "luxon"
import { FiCopy, FiDownload } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Brand } from "../ui/brand"

export type ShareCardPreviewData = {
	name: string
	username: string
	memberSince: string // ISO date
	scopeTag: string // e.g. "All-time" or "NBA"
	rank: number | null // null until a resolved call
	totalPoints: number
	accuracy: number | null
	callCount: number
}

type ShareCardPreviewProps = {
	data: ShareCardPreviewData
	onCopy: () => void
	onSave: () => void
	copied: boolean
	disabled: boolean
}

// What the user actually looks at when they open the share panel - real
// app UI built from the same components/tokens as the rest of the page, not
// a preview of the exported image. The PNG (built server-side in
// apps/api/src/lib/share-cards) only gets fetched when Copy/Save is
// actually clicked. Copy/Save live inside the Card itself (not a separate
// element after it) so they're clipped to the same rounded corners and
// read as part of one card, not a toolbar bolted on underneath it.
export function ShareCardPreview({
	data,
	onCopy,
	onSave,
	copied,
	disabled,
}: ShareCardPreviewProps) {
	return (
		<Card
			size="md"
			className={css({
				maxWidth: "475px",
				marginX: "auto",
				width: "100%",
			})}
		>
			<Card.Header>
				<VStack gap="3" alignItems="flex-start" width="full">
					<Brand size="sm" />
					<VStack gap="3" alignItems="center" width="full">
						<VStack gap="4" alignItems="center">
							<Avatar size="lg" name={data.name} />
							<VStack gap="1" alignItems="center">
								<Eyebrow size="sm" variant="neutral">
									{data.scopeTag}
								</Eyebrow>
								<span
									className={css({ fontFamily: "heading", fontSize: "xl" })}
								>
									{data.name}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "xs",
										color: "fg.subtle",
									})}
								>
									@{data.username} · Member since{" "}
									{DateTime.fromISO(data.memberSince).toFormat("MMM yyyy")}
								</span>
							</VStack>
						</VStack>
					</VStack>
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="3">
					<HStack gap="3" width="full" alignItems="stretch">
						<HeroStat
							label="Rank"
							value={data.rank !== null ? `#${data.rank}` : "N/A"}
							tone="accent"
						/>
						<HeroStat
							label="Accuracy"
							value={
								data.accuracy !== null ? `${Math.round(data.accuracy)}%` : "-"
							}
							tone={
								data.accuracy !== null && data.accuracy >= 50
									? "good"
									: "accent"
							}
						/>
					</HStack>
					<ShareStatRow label="Calls made" value={data.callCount} />
				</VStack>
			</Card.Body>
			<Card.Footer>
				<HStack
					justify="space-between"
					alignItems="center"
					className={css({ color: "fg.muted", fontSize: "2xs" })}
				>
					<span>
						{window.location.host}/user/{data.username}
					</span>
					<span>{data.totalPoints} pts</span>
				</HStack>
			</Card.Footer>
			<HStack
				gap="0"
				className={css({
					borderTop: "1px solid {colors.border.default}",
				})}
			>
				<button
					type="button"
					disabled={disabled}
					onClick={onCopy}
					className={css({
						flex: "1",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "2",
						paddingBlock: "3.5",
						fontFamily: "mono",
						fontSize: "xs",
						fontWeight: "medium",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.default",
						cursor: "pointer",
						transition: "background-color 0.15s ease",
						_hover: { backgroundColor: "bg.subtle" },
						_disabled: { opacity: "0.5", cursor: "not-allowed" },
					})}
				>
					<FiCopy size={14} />
					{copied ? "Copied" : "Copy"}
				</button>
				<button
					type="button"
					disabled={disabled}
					onClick={onSave}
					className={css({
						flex: "1",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "2",
						paddingBlock: "3.5",
						fontFamily: "mono",
						fontSize: "xs",
						fontWeight: "medium",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.default",
						cursor: "pointer",
						borderLeft: "1px solid {colors.border.default}",
						transition: "background-color 0.15s ease",
						_hover: { backgroundColor: "bg.subtle" },
						_disabled: { opacity: "0.5", cursor: "not-allowed" },
					})}
				>
					<FiDownload size={14} />
					Save
				</button>
			</HStack>
		</Card>
	)
}

type HeroStatTone = "accent" | "good"

type HeroStatProps = {
	label: string
	value: string
	// "good" only for a value that's actually earned it (accuracy >= 50%) -
	// everything else (rank has no inherent pass/fail threshold) stays on
	// the brand accent rather than reaching for a judgment it can't make.
	tone: HeroStatTone
}

function HeroStat({ label, value, tone }: HeroStatProps) {
	return (
		<VStack
			gap="1"
			alignItems="center"
			flex="1"
			className={css({
				borderRadius: "lg",
				paddingBlock: "3",
				paddingInline: "2",
				backgroundColor: tone === "good" ? "success.subtle" : "primary.subtle",
			})}
		>
			<Eyebrow size="sm" variant="neutral">
				{label}
			</Eyebrow>
			<span
				className={css({
					fontFamily: "heading",
					fontSize: "3xl",
					color: tone === "good" ? "verifiedVibrant" : "primary.default",
				})}
			>
				{value}
			</span>
		</VStack>
	)
}

type ShareStatRowProps = {
	label: string
	value: string | number
}

function ShareStatRow({ label, value }: ShareStatRowProps) {
	return (
		<HStack alignItems="center" justify="space-between" width="full">
			<Eyebrow size="sm" variant="neutral">
				{label}
			</Eyebrow>
			<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
				{value}
			</span>
		</HStack>
	)
}
