import type { ReactNode } from "react"
import { FiCamera } from "react-icons/fi"
import { css } from "styled-system/css"
import { useImagePicker } from "#/components/images/use-image-picker"
import { Banner, BannerPlaceholder } from "#/components/ui/banner"
import type { ImageTarget } from "#/lib/images/save-image"

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
//
// On the right it also crosses the empty margin the shell leaves once the
// window is wider than its 1320px column, so it reaches the window's edge.
// The left needs nothing extra: that margin sits behind the sidebar.
const bleed = css({
	marginLeft: { base: "-6", xl: "-8" },
	marginRight: {
		base: "-6",
		xl: "calc(-1 * ({spacing.8} + max(0px, (100vw - 1320px) / 2)))",
	},
	marginTop: { base: "-5", xl: "-6" },
})

const bannerButton = css({
	position: "relative",
	display: "block",
	width: "full",
	cursor: "pointer",
	_focusVisible: {
		outline: "2px solid {colors.primary.default}",
		outlineOffset: "-2px",
	},
})

const cameraBadge = css({
	position: "absolute",
	right: "3",
	bottom: "3",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "8",
	height: "8",
	borderRadius: "full",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	color: "fg.muted",
})

// The banner across the top of a profile, group or invite page, edge to edge.
// Without an image it's the plain frame, so profiles and groups all start at
// the same place (the invite page just leaves it out). Whoever can change it
// clicks it to open the picker. Must be the first thing on the page for the
// bleed to line up with the top.
export function PageBanner({ bannerUrl, edit }: Props) {
	const banner = bannerUrl ? (
		<Banner src={bannerUrl} variant="flush" />
	) : (
		<BannerPlaceholder variant="flush" />
	)

	return (
		<div className={bleed}>
			{edit ? (
				<EditableBanner
					banner={banner}
					hasImage={!!bannerUrl}
					target={edit.target}
					title={edit.title}
				/>
			) : (
				banner
			)}
		</div>
	)
}

function EditableBanner({
	banner,
	hasImage,
	target,
	title,
}: {
	banner: ReactNode
	hasImage: boolean
	target: ImageTarget
	title: string
}) {
	const picker = useImagePicker(target, title)
	return (
		<>
			{picker.input}
			<button
				type="button"
				className={bannerButton}
				onClick={picker.pick}
				aria-label={hasImage ? "Change banner" : "Upload banner"}
			>
				{banner}
				<span className={cameraBadge}>
					<FiCamera size={14} />
				</span>
			</button>
		</>
	)
}
