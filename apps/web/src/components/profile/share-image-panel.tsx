import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import {
	ShareCardPreview,
	type ShareCardPreviewData,
} from "./share-card-preview"

type Props = {
	// Same-origin path (see routes/share/*) - never the api's own domain.
	// Only ever fetched, never rendered directly as an <img src> - the panel
	// shows ShareCardPreview (real app UI) instead.
	src: string
	filename: string
	// Toggle button label when the panel is closed, e.g. "Share my career stats"
	label: string
	previewData: ShareCardPreviewData
}

type BlobState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; blob: Blob }
	| { status: "error" }

// Generic on purpose - this works the same way for a call's share card
// later as it does for a user's stats here: hand it a src/filename/preview.
//
// The PNG is only ever fetched lazily, on an actual Copy/Save click - not
// for the preview (see ShareCardPreview) and not eagerly on open. Earlier
// versions rendered the PNG directly via <img src>, which broke: a real
// <img> tag sends `Sec-Fetch-Dest: image`, which the dev server's
// static-asset short-circuit 404s before the request reaches the dynamic
// proxy route. Routing everything through explicit fetch() calls (which
// send `Sec-Fetch-Dest: empty`) sidesteps that entirely, on top of being
// what the user actually asked for here.
export function ShareImagePanel({ src, filename, label, previewData }: Props) {
	const [open, setOpen] = useState(false)
	const [copied, setCopied] = useState(false)
	const [blobState, setBlobState] = useState<BlobState>({ status: "idle" })

	async function getBlob(): Promise<Blob | null> {
		if (blobState.status === "ready") return blobState.blob
		setBlobState({ status: "loading" })
		try {
			const res = await fetch(src)
			if (!res.ok) throw new Error("share image request failed")
			const blob = await res.blob()
			setBlobState({ status: "ready", blob })
			return blob
		} catch {
			setBlobState({ status: "error" })
			return null
		}
	}

	async function handleCopy() {
		const blob = await getBlob()
		if (!blob) return
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob }),
			])
			setCopied(true)
			setTimeout(() => setCopied(false), 1200)
		} catch {
			// Clipboard image writes aren't universally supported (older Safari
			// in particular) - Save below always works as a fallback.
		}
	}

	async function handleSave() {
		const blob = await getBlob()
		if (!blob) return
		const objectUrl = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = objectUrl
		link.download = filename
		link.click()
		URL.revokeObjectURL(objectUrl)
	}

	const loading = blobState.status === "loading"

	return (
		<VStack alignItems="stretch" gap="3">
			<Button
				variant="dark"
				size="md"
				fullWidth
				onClick={() => setOpen((o) => !o)}
			>
				{open ? "Hide Card" : label}
			</Button>
			{open && (
				<VStack alignItems="stretch" gap="2">
					<ShareCardPreview
						data={previewData}
						onCopy={handleCopy}
						onSave={handleSave}
						copied={copied}
						disabled={loading}
					/>
					{blobState.status === "error" && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "danger.default",
								textAlign: "center",
							})}
						>
							Couldn't generate the image. Try again.
						</span>
					)}
				</VStack>
			)}
		</VStack>
	)
}
