import { createFileRoute } from '@tanstack/react-router'
import { css } from '../../styled-system/css'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className={css({ p: '8' })}>
      <h1 className={css({ fontSize: '4xl', fontWeight: 'bold' })}>
        Welcome to TanStack Start
      </h1>
      <p className={css({ mt: '4', fontSize: 'lg' })}>
        Edit <code>src/routes/index.tsx</code> to get started.
      </p>
    </div>
  )
}
