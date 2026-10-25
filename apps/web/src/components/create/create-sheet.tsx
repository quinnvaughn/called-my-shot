// What the Create (+) button opens, via openModal(<CreateSheet />): one row
// per kind in lib/create-kinds.ts, each going to that kind's composer.
import { css } from "styled-system/css"
import { Sheet } from "#/components/ui/sheet"
import { CREATE_KINDS } from "#/lib/create-kinds"
import { closeModal } from "#/stores/modal-store"
import { CreateKindRow } from "./create-kind-row"

export function CreateSheet() {
	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>Create</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body
				className={css({ display: "flex", flexDirection: "column", gap: "1" })}
			>
				{CREATE_KINDS.map((kind) => (
					<CreateKindRow key={kind.key} kind={kind} onNavigate={closeModal} />
				))}
			</Sheet.Body>
		</Sheet>
	)
}
