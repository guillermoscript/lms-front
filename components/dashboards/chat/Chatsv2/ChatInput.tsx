import { Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ChatInput({ input, handleInputChange, handleSubmit, disabled }: {
    input: string
    handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void
    disabled: boolean
}) {
    return (
        <form
            className="relative w-full"
            onSubmit={event => {
                event.preventDefault()
                if (disabled) return
                handleSubmit(event)
            }}
        >
            <Input
                placeholder="How can I help you today?"
                className="pr-24 py-6"
                value={input}
                onChange={handleInputChange}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Button
                    disabled={disabled}
                    variant="ghost" size="icon" className="h-8 w-8"
                >
                    <Send className="h-4 w-4" />
                </Button>
            </div>
        </form>
    )
}
