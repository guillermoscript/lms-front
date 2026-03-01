import type { MDXComponents } from 'mdx/types'

// Este archivo es requerido por @next/mdx pero también lo usamos 
// para next-mdx-remote-client. Los componentes se definen en 
// components/lesson/mdx-components.tsx y se importan aquí.

// Importación lazy para evitar errores si el archivo aún no existe
let lessonComponents: MDXComponents = {}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/components/lesson/mdx-components')
  lessonComponents = mod.lessonComponents || {}
} catch {
  // El módulo aún no existe, usar objeto vacío
}

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...lessonComponents,
    ...components,
  }
}
