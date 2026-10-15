import { Tag } from "#/components/ui/tag"

// Beside the section title on both cards, so it shows while the numbers are
// folded away: one side averaging far less of the asked stat is the first
// thing worth knowing about a head-to-head.
export function MismatchTag({ show }: { show: boolean }) {
	if (!show) return null
	return (
		<Tag variant="secondary" size="sm">
			Mismatch
		</Tag>
	)
}
