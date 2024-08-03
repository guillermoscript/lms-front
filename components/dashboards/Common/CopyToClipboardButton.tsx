'use client'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useCopyToClipboard } from 'usehooks-ts'

import { useToast } from '@/components/ui/use-toast'

interface CopyToClipboardButtonProps {
    content: string;
}

export default function CopyToClipboardButton({ content }: CopyToClipboardButtonProps) {
    const [copiedText, copy] = useCopyToClipboard()
    const { toast } = useToast()
    const [isCopied, setIsCopied] = useState(false)

    const handleCopy = (text: string) => () => {
        copy(text)
            .then(() => {
                toast({
                    title: 'Copied!',
                })
                setIsCopied(true)
                setTimeout(() => setIsCopied(false), 4000)
            })
            .catch(error => {
                console.error('Failed to copy!', error)
            })
    }

    return (
        <button
            onClick={handleCopy(content)}
            className={`text-gray-900 dark:text-gray-400 m-0.5 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 rounded-lg py-2 px-2.5 inline-flex items-center justify-center bg-white border-gray-200 border ${isCopied ? 'bg-green-500' : ''}`}
        >
            {isCopied ? (
                <span className="inline-flex items-center">
                    <Check className="w-3 h-3" />
                </span>
            ) : (
                <span className="inline-flex items-center">
                    <Copy className="w-3 h-3" />
                </span>
            )}
        </button>
    )
}
