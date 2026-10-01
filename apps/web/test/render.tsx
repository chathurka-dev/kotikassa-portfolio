import type { ReactElement } from 'react'
import { render as testingLibraryRender, type RenderOptions } from '@testing-library/react'

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return testingLibraryRender(ui, options)
}

export * from '@testing-library/react'
