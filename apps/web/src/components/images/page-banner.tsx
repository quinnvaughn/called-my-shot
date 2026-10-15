import { css, cx } from "styled-system/css"
import { useRightRail } from "#/components/app-shell/use-right-rail"
import { Banner } from "#/components/ui/banner"
import { BannerPlaceholder } from "#/components/ui/banner-placeholder"
import { ImageLightbox } from "#/components/ui/image-lightbox"
import type { ImageTarget } from "#/lib/images/save-image"
import { openModal } from "#/stores/modal-store"
import { EditBannerButton } from "./edit-banner-button"

type Props = {
	bannerUrl: string | null
	// Set when the viewer can change it: the profile's owner, or one of the
	// group's admins. `title` is the crop modal's.
	edit?: { target: ImageTarget; title: string } | null
}

// Cancels <main>'s padding in app-shell.tsx, so the banner runs to the edges
// of the content column and up to the top of the page. Change both together.
// Below xl that's 5 on top but 6 at the sides: main sets both `padding: 5` and
// `px: 6`, and the px wins. From xl, 6 on top and 8 at the sides.
const bleed = css({
	marginLeft: { base: "-6", xl: "-8" },
	marginRight: { base: "-6", xl: "-8" },
	marginTop: { base: "-5", xl: "-6" },
})

// With no right rail, the right edge also crosses the empty margin the shell
// leaves once the window is wider than its 1320px column, so it reaches the
// window's edge. The left needs nothing extra: that margin sits behind the
// sidebar. With a rail, the rail fills that side from xl, so the banner stops
// at main's border.
const bleedToWindow = css({
	marginRight: {
		xl: "calc(-1 * ({spacing.8} + max(0px, (100vw - 1320px) / 2)))",
	},
})

// The bleed wrapper is the positioning context for the camera button.
const frame = css({ position: "relative" })

const viewButton = css({
	display: "block",
	width: "full",
	cursor: "zoom-in",
	_focusVisible: {
		outline: "2px solid {colors.primary.default}",
		outlineOffset: "-2px",
	},
})

// The banner across the top of a profile, group or invite page, edge to edge.
// Without an image it's the plain frame, so profiles and groups all start at
// the same place (the invite page just leaves it out). Clicking an uploaded
// banner opens it full size; only the camera button, shown to whoever can
// change it, edits it. Must be the first thing on the page for the bleed to
// line up with the top.
export function PageBanner({ bannerUrl, edit }: Props) {
	const hasRail = !!useRightRail()
	return (
		<div className={cx(bleed, hasRail ? undefined : bleedToWindow, frame)}>
			{bannerUrl ? (
				<button
					type="button"
					className={viewButton}
					onClick={() =>
						openModal(<ImageLightbox src={bannerUrl} alt="Banner" />)
					}
					aria-label="View banner"
				>
					<Banner src={bannerUrl} variant="flush" />
				</button>
			) : (
				<BannerPlaceholder variant="flush" />
			)}
			{edit && (
				<EditBannerButton
					hasImage={!!bannerUrl}
					target={edit.target}
					title={edit.title}
				/>
			)}
		</div>
	)
}
