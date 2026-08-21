import { FiCopy, FiDownload } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Brand } from "#/components/ui/brand"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import type { SharePreviewRenderProps } from "../profile/share-image-panel"

export type CallShareCardPreviewData = {
	questionTitle: string
	leagueAbbr: string
	categoryLabel: string
	name: string
	username: string
	// Already formatted for display (e.g. "Minnesota Timberwolves", "Over
	// 47.5", "62") - see pickSummary in lib/call-summary.ts, which already
	// handles every question type's own formatting rules.
	pickLabel: string
	isWin: boolean
	points: number
	// % of the field that also picked this - null for multi_select (no
	// single number describes several independent picks at once).
	fieldPct: number | null
	conviction: number
	caseText: string | null
	quip: string
}

type Props = SharePreviewRenderProps & { data: CallShareCardPreviewData }

// The call-result analog of ShareCardPreview - same Card shell, Brand
// wordmark, and Copy/Save footer, but built around a single pick/outcome
// instead of a career stat line. Kept as its own component rather than
// bolted onto ShareCardPreview's data shape: the two cards show fundamentally
// different things (a track record vs. one call), and ShareImagePanel's
// renderPreview prop is exactly what lets both share the same Copy/Save
// machinery without either forcing its shape on the other.
export function CallShareCardPreview({
	data,
	onCopy,
	onSave,
	copied,
	disabled,
}: Props) {
	const win = data.isWin
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
				<VStack gap="4" alignItems="center" width="full">
					<Brand size="sm" />
					<VStack gap="1.5" alignItems="center">
						<Eyebrow size="sm" variant={win ? "primary" : "neutral"}>
							{win ? "Called it" : "Missed"}
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "2xl",
								textAlign: "center",
								lineHeight: "1.15",
								color: win ? "fg.default" : "fg.muted",
							})}
						>
							{data.pickLabel}
						</span>
						<span
							className={css({
								fontSize: "xs",
								color: "fg.subtle",
								textAlign: "center",
							})}
						>
							{data.questionTitle}
						</span>
					</VStack>
					<HStack gap="2" alignItems="center">
						<Avatar size="xs" name={data.name} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
							})}
						>
							@{data.username}
						</span>
					</HStack>
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					{data.caseText && (
						<p
							className={css({
								fontSize: "xs",
								fontStyle: "italic",
								color: "fg.body",
								lineHeight: "relaxed",
								borderLeft: "2px solid {colors.border.emphasized}",
								paddingLeft: "3",
							})}
						>
							"{data.caseText}"
						</p>
					)}
					<VStack gap="2.5" alignItems="stretch">
						{data.fieldPct !== null && (
							<ShareStatRow
								label="Field agreed"
								value={`${Math.round(data.fieldPct)}%`}
							/>
						)}
						<ShareStatRow
							label="Conviction"
							value={`${Math.round(data.conviction)}%`}
						/>
					</VStack>
					<HStack
						justify="space-between"
						alignItems="baseline"
						className={css({
							borderTop: "1px solid {colors.border.default}",
							paddingTop: "3",
						})}
					>
						<Eyebrow size="sm" variant="neutral">
							Result
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "2xl",
								color: win ? "success.default" : "danger.default",
							})}
						>
							{win ? "+" : "−"}
							{Math.abs(data.points)} pts
						</span>
					</HStack>
					<p
						className={css({
							fontSize: "xs",
							fontStyle: "italic",
							color: "fg.subtle",
							textAlign: "center",
						})}
					>
						{data.quip}
					</p>
				</VStack>
			</Card.Body>
			<Card.Footer>
				<HStack
					justify="space-between"
					alignItems="center"
					className={css({ color: "fg.muted", fontSize: "2xs" })}
				>
					<span>calledmyshot.com/{data.username}</span>
					<span>
						{data.leagueAbbr} · {data.categoryLabel}
					</span>
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

function ShareStatRow({ label, value }: { label: string; value: string }) {
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
