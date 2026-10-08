import type { ComponentProps } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { safeHref } from './safe-href'

export { safeHref, safeOptionalHref } from './safe-href'

type ButtonLinkProps = ComponentProps<'a'> & VariantProps<typeof buttonVariants>

/**
 * CTA navigation keeps link semantics and the school's shared button
 * appearance. The href always goes through `safeHref()`.
 */
export function ButtonLink({ variant, size, className, href, ...props }: ButtonLinkProps) {
  return (
    <a
      {...props}
      href={safeHref(href)}
      className={cn(buttonVariants({ variant, size }), 'no-underline transition-colors motion-reduce:transition-none', className)}
    />
  )
}
