import { frame, type Variant } from "./banner"

// The empty frame: a page's default banner, and the settings preview before
// one exists.
export function BannerPlaceholder({ variant }: { variant?: Variant }) {
	return <div className={frame({ variant })} />
}
