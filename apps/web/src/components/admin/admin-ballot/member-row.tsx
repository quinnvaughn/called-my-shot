import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { TextInput } from "#/components/ui/text-input"
import { questionShapeLabel } from "#/lib/question-labels"

export function MemberRow({
	member,
	position,
	total,
	onMove,
	onSave,
	onRemove,
}: {
	member: {
		id: string
		label: string
		slot: string | null
		section: string | null
		question: { id: string; title: string; shape: string; status: string }
	}
	position: number
	total: number
	onMove: (direction: "up" | "down") => void
	onSave: (label: string, slot: string, section: string) => void
	onRemove: () => void
}) {
	const [label, setLabel] = useState(member.label)
	const [slot, setSlot] = useState(member.slot ?? "")
	const [section, setSection] = useState(member.section ?? "")

	return (
		<HStack
			gap="3"
			alignItems="center"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				padding: "3",
			})}
		>
			<span
				className={css({
					textStyle: "metaLg",
					color: "fg.subtle",
					width: "5",
					textAlign: "right",
					flexShrink: 0,
				})}
			>
				{position + 1}
			</span>
			<HStack gap="1" flexShrink={0}>
				<Button
					variant="ghost"
					size="sm"
					disabled={position === 0}
					onClick={() => onMove("up")}
				>
					↑
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={position === total - 1}
					onClick={() => onMove("down")}
				>
					↓
				</Button>
			</HStack>
			<TextInput className={css({ width: "20", flexShrink: 0 })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="1B"
						maxLength={8}
						value={slot}
						onChange={(e) => setSlot(e.target.value)}
						onBlur={() => onSave(label, slot, section)}
					/>
				</TextInput.Group>
			</TextInput>
			<TextInput className={css({ flexShrink: 0, width: "48" })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="First base"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={() => onSave(label, slot, section)}
					/>
				</TextInput.Group>
			</TextInput>
			{/* Optional heading for a run of consecutive members - blank on
			    every ungrouped ballot, which is most of them. The public list
			    draws it once where it changes, so leaving it blank here is
			    what keeps a ballot ungrouped. */}
			<TextInput className={css({ flexShrink: 0, width: "36" })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Section"
						maxLength={40}
						value={section}
						onChange={(e) => setSection(e.target.value)}
						onBlur={() => onSave(label, slot, section)}
					/>
				</TextInput.Group>
			</TextInput>
			<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
				<Link
					to="/questions/$questionId/{-$slug}"
					params={{ questionId: member.question.id }}
					className={css({
						fontSize: "sm",
						truncate: true,
						_hover: { textDecoration: "underline" },
					})}
				>
					{member.question.title}
				</Link>
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{questionShapeLabel[
						member.question.shape as keyof typeof questionShapeLabel
					] ?? member.question.shape}
				</span>
			</VStack>
			<Button variant="ghost" size="sm" onClick={onRemove}>
				Remove
			</Button>
		</HStack>
	)
}
