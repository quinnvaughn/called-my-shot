import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { Button } from "#/components/ui/button"
import { TextInput } from "#/components/ui/text-input"
import { type ShareCampaign, useTagShareUrl } from "#/lib/share-links"

type Props = {
	// Absolute. Build it from SITE_ORIGIN (lib/meta.ts) rather than
	// window.location.origin - the call page renders this during SSR, where
	// there is no window, unlike ShareQuestionModal which only ever mounts
	// from a click.
	url: string
	// What the field shows. Usually the same url without its scheme, which is
	// what fits and what people recognise.
	displayUrl: string
	// Tags the copied and shared url with where it came from. Omitted for
	// invite links, whose code already attributes the visit.
	campaign?: ShareCampaign
	// The thing being shared, for the OS share sheet's title.
	shareTitle: string
	// Analytics belongs to the caller - this component doesn't know which
	// surface it's on or what's being shared.
	onCopied?: () => void
	onNativeShared?: () => void
}

// The link half of sharing, identical for a question and for a call: a
// readonly field, a Copy button, and the OS share sheet where one exists.
// Extracted from ShareQuestionModal, which keeps its group-sharing half -
// that part is question-specific and doesn't generalise.
export function CopyLinkRow({
	url,
	displayUrl,
	campaign,
	shareTitle,
	onCopied,
	onNativeShared,
}: Props) {
	const [copied, setCopied] = useState(false)
	const tagShareUrl = useTagShareUrl(campaign)

	function handleCopy() {
		navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		onCopied?.()
		setCopied(true)
		setTimeout(() => setCopied(false), 1200)
	}

	async function handleNativeShare() {
		try {
			await navigator.share({
				title: shareTitle,
				url: tagShareUrl(url, "native"),
			})
			onNativeShared?.()
		} catch {
			// A dismissed OS share sheet rejects the same way a failure does,
			// and neither is worth surfacing - the Copy button above still works.
		}
	}

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" gap="3">
				<TextInput className={css({ flex: 1, minWidth: 0 })}>
					<TextInput.Group>
						<TextInput.Field readOnly value={displayUrl} />
					</TextInput.Group>
				</TextInput>
				<Button variant="dark" onClick={handleCopy}>
					{copied ? "Copied" : "Copy"}
				</Button>
			</HStack>
			{/* Only exists on mobile browsers (and Safari) - the Copy button
			above is the universal path, this is the shortcut into
			iMessage/WhatsApp/etc. where the OS offers one. */}
			{typeof navigator !== "undefined" && "share" in navigator && (
				<button
					type="button"
					onClick={handleNativeShare}
					className={arrowLink({ tone: "quiet" })}
				>
					or open your device's share sheet →
				</button>
			)}
		</VStack>
	)
}
