'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

const useScrollAnchor = () => {
  const messagesRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibilityRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [manualScroll, setManualScroll] = useState(false)

  const scrollToBottom = useCallback(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
  }, [])

  const handleScroll = (event: Event) => {
    const target = event.target as HTMLDivElement
    const offset = 10
    const newIsAtBottom =
      target.scrollTop + target.clientHeight >= target.scrollHeight - offset
    setIsAtBottom(newIsAtBottom)

    if (!newIsAtBottom) {
      setManualScroll(true) // User scrolled up
    } else {
      setManualScroll(false) // User scrolled to bottom
    }
  }

  useEffect(() => {
    const { current } = scrollRef
    if (current) {
      current.addEventListener('scroll', handleScroll, { passive: true })
      return () => {
        current.removeEventListener('scroll', handleScroll)
      }
    }
  }, [scrollRef.current])

  useEffect(() => {
    if (!manualScroll) {
      scrollToBottom()
    }
  }, [manualScroll, messagesRef.current])

  return {
    messagesRef,
    scrollRef,
    visibilityRef,
    scrollToBottom,
    isAtBottom,
  }
}

export default useScrollAnchor