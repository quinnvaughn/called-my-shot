import type { AuthModalSurface } from "#/lib/auth-modal-copy"

export type FieldsProps = {
	onSuccess?: () => void
	surface: AuthModalSurface
}
