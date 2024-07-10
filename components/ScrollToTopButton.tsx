'use client'
import { ArrowBigUpDash } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

function ScrollToTopButton () {
    const [isVisible, setIsVisible] = useState<boolean>(false)

    const toggleVisibility = () => {
        if (window.pageYOffset > 300) {
            setIsVisible(true)
        } else {
            setIsVisible(false)
        }
    }

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        })
    }

    useEffect(() => {
        window.addEventListener('scroll', toggleVisibility)
        return () => {
            window.removeEventListener('scroll', toggleVisibility)
        }
    }, [])

    return (
        <div>
            {isVisible && (
                <Button
                    variant='outline'
                    onClick={scrollToTop}
                    className="fixed bottom-5 right-5 p-3 rounded-md shadow-lg"
                >
                    <ArrowBigUpDash size={24} />
                </Button>
            )}
        </div>
    )
}

export default ScrollToTopButton
