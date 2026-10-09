import { FiMoreHorizontal } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Dropdown } from "#/components/ui/dropdown"
import { Identity } from "#/components/ui/identity"
import type { IdentityData } from "#/lib/identity"

export type PresserMenuAction = {
	label: string
	danger?: boolean
	onSelect: () => void
}

export const presserEyebrow = css({
	fontFamily: "mono",
	fontSize: "4xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
})

const bodyText = css({
	fontSize: "sm",
	color: "fg.body",
	lineHeight: "relaxed",
	whiteSpace: "pre-wrap",
	overflowWrap: "anywhere",
})

type Props = {
	// Null on a question the app asked.
	asker: IdentityData | null
	// The question an app question is about, when it's about one call.
	callTitle: string | null
	body: string
	answer: { kind: "text"; text: string } | { kind: "no_comment" } | null
	actions: PresserMenuAction[]
	// The answer form, on the A line of a question still waiting on the owner.
	children?: React.ReactNode
}

export function PresserMenu({
	label,
	actions,
}: {
	label: string
	actions: PresserMenuAction[]
}) {
	if (actions.length === 0) return null
	return (
		<Dropdown>
			<Dropdown.Trigger
				aria-label={label}
				className={css({
					display: "flex",
					padding: "1.5",
					borderRadius: "md",
					color: "fg.muted",
					_hover: { bg: "fg.default/10", color: "fg.default" },
				})}
			>
				<FiMoreHorizontal size={16} />
			</Dropdown.Trigger>
			<Dropdown.Content>
				{actions.map((action) => (
					<Dropdown.Item
						key={action.label}
						onClick={action.onSelect}
						className={
							action.danger ? css({ color: "danger.default" }) : undefined
						}
					>
						{action.label}
					</Dropdown.Item>
				))}
			</Dropdown.Content>
		</Dropdown>
	)
}

// The Q and A down the margin, the way a press conference transcript is
// set. Kept narrow and quiet so the words carry the row.
export const marginMark = css({
	fontFamily: "mono",
	fontSize: "xs",
	fontWeight: "bold",
	color: "fg.subtle",
	lineHeight: "relaxed",
})

export const transcriptRow = css({
	display: "grid",
	gridTemplateColumns: "1.25rem minmax(0, 1fr)",
	columnGap: "3",
	alignItems: "start",
})

// One question and, once there is one, its answer, set as a transcript.
// Questions the app asked read "From your results" where the asker would be.
export function PresserQaItem({
	asker,
	callTitle,
	body,
	answer,
	actions,
	children,
}: Props) {
	return (
		<VStack
			gap="3"
			alignItems="stretch"
			className={css({
				paddingTop: "4",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<div className={transcriptRow}>
				<span aria-hidden className={marginMark}>
					Q
				</span>
				<HStack justify="space-between" alignItems="flex-start" gap="3">
					<VStack gap="1" alignItems="flex-start" minWidth="0">
						{asker ? (
							<Identity
								name={asker.name}
								username={asker.username}
								avatarUrl={asker.avatarUrl}
								flair={asker.flair}
								size="xs"
							/>
						) : (
							<span className={presserEyebrow}>
								From your results{callTitle ? ` · ${callTitle}` : ""}
							</span>
						)}
						<p className={css({ fontSize: "sm", fontWeight: "semibold" })}>
							{body}
						</p>
					</VStack>
					<PresserMenu label="Question options" actions={actions} />
				</HStack>
			</div>
			{(answer || children) && (
				<div className={transcriptRow}>
					<span aria-hidden className={marginMark}>
						A
					</span>
					{answer?.kind === "text" && <p className={bodyText}>{answer.text}</p>}
					{answer?.kind === "no_comment" && (
						<span
							className={css({
								justifySelf: "start",
								fontFamily: "mono",
								fontSize: "2xs",
								fontWeight: "bold",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "fg.muted",
								paddingInline: "2",
								paddingBlock: "1",
								borderRadius: "sm",
								border: "1px solid {colors.border.default}",
							})}
						>
							No comment
						</span>
					)}
					{!answer && children}
				</div>
			)}
		</VStack>
	)
}

export { bodyText as presserBodyText }
