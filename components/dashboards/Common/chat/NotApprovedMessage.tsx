import { X } from 'lucide-react'
import React from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'

interface NotApprovedMessageProps {
    message: string
    onClose: () => void
}

const NotApprovedMessage: React.FC<NotApprovedMessageProps> = ({ message, onClose, }) => {
    const t = useScopedI18n('NotApprovedMessage')
    return (
        <div className="text-center text-red-500 my-4 p-4 border border-dashed border-red-300 rounded-lg">
            <h2 className="text-lg font-semibold mb-2 flex items-center justify-center">
                {t('title')}
                <Button onClick={onClose} variant="outline" className="ml-2 p-1">
                    <X className="h-4 w-4" />
                </Button>
            </h2>
            <p className="text-sm mb-4">{message}</p>
        </div>
    )
}

export default NotApprovedMessage
