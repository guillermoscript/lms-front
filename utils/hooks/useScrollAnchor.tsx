'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export default function useScrollAnchor () {
    const scrollRef = useRef<HTMLDivElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const visibilityRef = useRef<HTMLDivElement>(null)

    const [isAtBottom, setIsAtBottom] = useState(true)
    const [isVisible, setIsVisible] = useState(false)

    const scrollToBottom = useCallback(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [])

    useEffect(() => {
        if (scrollRef.current) {
            const handleScroll = () => {
                const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
                const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 25
                setIsAtBottom(isAtBottom)
            }

            scrollRef.current.addEventListener('scroll', handleScroll, { passive: true })

            return () => {
                if (scrollRef.current) {
                    scrollRef.current.removeEventListener('scroll', handleScroll)
                }
            }
        }
    }, [])

    useEffect(() => {
        if (visibilityRef.current) {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => setIsVisible(entry.isIntersecting))
            }, { rootMargin: '0px 0px -150px 0px' })

            observer.observe(visibilityRef.current)

            return () => {
                if (visibilityRef.current) {
                    observer.disconnect()
                }
            }
        }
    }, [])

    return {
        scrollRef,
        messagesEndRef,
        visibilityRef,
        isAtBottom,
        isVisible,
        scrollToBottom
    }
}
