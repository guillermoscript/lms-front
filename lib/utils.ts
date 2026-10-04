import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The theme-controlled corner tokens (#762): rounded-button, rounded-card,
// rounded-input and their side variants. Registered so a call-site rounded-*
// replaces the token instead of both classes landing and CSS order deciding.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ["button", "card", "input"] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
