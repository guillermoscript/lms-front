import { useScopedI18n } from '@/app/locales/client'

import SuggestionsContainer from '../Common/chat/SuggestionsContainer'

const EmptyChatState: React.FC<{
    onSuggestionClick: (suggestion: string) => void
}> = async ({
    onSuggestionClick,
}) => {
    const t = useScopedI18n('EmptyChatState')

    return (
        <div className="flex flex-col gap-4">
            <p className="text-lg">
                {t('title')}
            </p>
            <div className="w-full flex flex-col gap-4">
                <SuggestionsContainer
                    suggestions={[
                        {
                            title: 'What is the capital of France?',
                            description: 'Ask me about anything',
                        },
                        {
                            title: 'What is the weather in London?',
                            description: 'Ask me about anything',
                        },
                        {
                            title: 'What is the population of New York?',
                            description: 'Ask me about anything',
                        },
                    ]}
                    onSuggestionClick={(suggestion) => {
                        onSuggestionClick(suggestion)
                    }}
                />
            </div>
        </div>
    )
}

export default EmptyChatState
