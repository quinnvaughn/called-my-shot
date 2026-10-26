import { useRef, useState } from "react"
import { FiDownload } from "react-icons/fi"
import { Button } from "#/components/ui/button"
import { showToast } from "#/stores/toast-store"

type Props = {
	// The post's 4:5 share image, through the web's passthrough
	// (/share/rushmore/{id}/portrait, /share/redraft/{id}/portrait).
	imagePath: string
	// What the saved file is called, e.g. "celtics-rushmore.png".
	fileName: string
}

// The post as a picture, for people who'd rather post an image than a
// link (Reddit, Instagram, a group chat), whenever they get to it. On a
// computer it downloads the 4:5 portrait card. On a phone it opens the share
// sheet, since that's where Save Image lives on iOS, with the apps beside it.
// Sits beside the post's ShareLinkRow, which shares the link instead.
export function ShareImageButton({ imagePath, fileName }: Props) {
	const [pending, setPending] = useState(false)
	// Kept once fetched. A share sheet only opens straight off a tap, and a
	// slow render can outlast that, so the second tap needs the file ready.
	const fileRef = useRef<File | null>(null)

	async function loadImage(): Promise<File> {
		if (fileRef.current) return fileRef.current
		const response = await fetch(imagePath)
		if (!response.ok) throw new Error(`Share image: ${response.status}`)
		const blob = await response.blob()
		const name = fileName.endsWith(".png") ? fileName : `${fileName}.png`
		fileRef.current = new File([blob], name, { type: "image/png" })
		return fileRef.current
	}

	async function handleClick() {
		setPending(true)
		try {
			const image = await loadImage()
			if (onPhone() && navigator.canShare?.({ files: [image] })) {
				await shareFile(image)
			} else {
				download(image)
			}
		} catch {
			showToast({ message: "Couldn't make the image. Try again." })
		} finally {
			setPending(false)
		}
	}

	return (
		<Button
			variant="outline"
			loading={pending}
			onClick={() => void handleClick()}
		>
			{!pending && <FiDownload aria-hidden />}
			Save image
		</Button>
	)
}

// A touch-first device, where saving a picture goes through the share sheet.
// Desktop browsers that also have a share sheet (Safari, Chrome on a Mac)
// download instead, which is what saving means there.
function onPhone(): boolean {
	return window.matchMedia("(pointer: coarse)").matches
}

async function shareFile(image: File) {
	try {
		await navigator.share({ files: [image] })
	} catch (caught) {
		// The browser stopped honoring the tap while the image rendered. The
		// file is kept, so the next tap opens the sheet at once.
		if (caught instanceof DOMException && caught.name === "NotAllowedError") {
			showToast({ message: "Your image is ready. Tap Save image again." })
		}
		// Anything else is the sheet being dismissed, which needs no reply.
	}
}

function download(image: File) {
	const url = URL.createObjectURL(image)
	const link = document.createElement("a")
	link.href = url
	link.download = image.name
	document.body.appendChild(link)
	link.click()
	link.remove()
	// Revoked a moment later rather than at once: some browsers start the
	// download asynchronously and would find the url already gone.
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
