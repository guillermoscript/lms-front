import { cn } from "@/lib/utils"

/**
 * Loading placeholder. Pulses softly; the pulse is dropped under
 * `prefers-reduced-motion` so the block is static but still visible.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
