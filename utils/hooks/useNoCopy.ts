'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'

function useNoCopy(ref: React.RefObject<HTMLElement>) {
    useEffect(() => {
        if (!ref.current) return

        const handleCopy = (event) => {
            event.preventDefault()
            toast.error('Copying is disabled.')
        }

        // Add event listener to prevent copying.
        ref.current.addEventListener('copy', handleCopy)

        // Clean up event listener on component unmount.
        return () => {
            if (ref.current) {
                ref.current.removeEventListener('copy', handleCopy)
            }
        }
    }, [ref])
}

export default useNoCopy
