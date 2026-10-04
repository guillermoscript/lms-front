import type { ComponentProps } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ButtonLinkProps = ComponentProps<'a'> & VariantProps<typeof buttonVariants>

/** CTA navigation keeps link semantics and the school's shared button appearance. */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <a className={cn(buttonVariants({ variant, size }), 'no-underline transition-colors motion-reduce:transition-none', className)} {...props} />
}
