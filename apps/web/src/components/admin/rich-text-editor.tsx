import "@mdxeditor/editor/style.css"
import "./rich-text-editor.css"
import {
	BlockTypeSelect,
	BoldItalicUnderlineToggles,
	CreateLink,
	headingsPlugin,
	InsertImage,
	InsertThematicBreak,
	imagePlugin,
	ListsToggle,
	linkDialogPlugin,
	linkPlugin,
	listsPlugin,
	MDXEditor,
	markdownShortcutPlugin,
	quotePlugin,
	Separator,
	thematicBreakPlugin,
	toolbarPlugin,
	UndoRedo,
} from "@mdxeditor/editor"
import { css } from "styled-system/css"
import { updateBodyStyles } from "#/components/updates/update-body"
import { uploadUpdateImage } from "#/lib/images/upload-update-image"

type Props = {
	// Read once, when the editor mounts. Key the editor to load different text.
	initialMarkdown: string
	// normalizing is true for the editor's own first pass over the initial
	// text, which can rewrite it into its markdown style (`*` to `_`) without
	// anyone having edited anything.
	onChange: (markdown: string, normalizing: boolean) => void
	onImageError: (error: unknown) => void
}

// A formatting toolbar over markdown: what's typed here is saved as markdown,
// which the page and the email both render. Only the formatting both of those
// support is offered - no underline, no resizing images - since either would
// be written out as raw HTML, which the renderers show as text.
//
// Browser only (it edits the DOM directly), so it's loaded lazily behind
// ClientOnly by update-editor.tsx and its weight never reaches a public page.
export default function RichTextEditor({
	initialMarkdown,
	onChange,
	onImageError,
}: Props) {
	return (
		<MDXEditor
			markdown={initialMarkdown}
			onChange={onChange}
			// Also applied to the popup container, so it carries no box styling
			// of its own - see rich-text-editor.css.
			className="dark-theme update-editor-theme"
			contentEditableClassName={`${updateBodyStyles} ${css({
				minHeight: "80",
				padding: "4",
			})}`}
			plugins={[
				headingsPlugin({ allowedHeadingLevels: [2, 3] }),
				listsPlugin(),
				quotePlugin(),
				thematicBreakPlugin(),
				linkPlugin(),
				linkDialogPlugin(),
				imagePlugin({
					disableImageResize: true,
					allowSetImageDimensions: false,
					imageUploadHandler: async (file) => {
						try {
							return (await uploadUpdateImage(file)).url
						} catch (error) {
							onImageError(error)
							throw error
						}
					},
				}),
				markdownShortcutPlugin(),
				toolbarPlugin({
					toolbarContents: () => (
						<>
							<UndoRedo />
							<Separator />
							<BlockTypeSelect />
							<BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
							<Separator />
							<ListsToggle options={["bullet", "number"]} />
							<CreateLink />
							<InsertImage />
							<InsertThematicBreak />
						</>
					),
				}),
			]}
		/>
	)
}
