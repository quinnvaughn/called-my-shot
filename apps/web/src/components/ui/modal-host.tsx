import { useStore } from "@tanstack/react-store"
import { modalStore } from "#/stores/modal-store"

// Mounted once at the app root. Purely renders the top of modalStore's stack
// — opening a modal is openModal(<YourModal />), where YourModal renders
// <Modal>...</Modal> as its own root. ModalHost never needs to change when a
// new modal is added, nested or not.
export function ModalHost() {
	return useStore(modalStore, (state) => state.at(-1) ?? null)
}
