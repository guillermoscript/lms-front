import { cn } from '@/utils' // Assuming the utility function is located here based on your workspace

const SuggestionButton = ({ title, description, onSuggestionClick }: {
    title: string
    description: string
    onSuggestionClick: (title: string) => void
}) => (
    <div className="snap-center shrink-0">
        <button
            onClick={() => onSuggestionClick(title)}
            className={cn(
                'flex flex-col flex-1 shrink-0 w-64 justify-between h-36 p-5 px-6 rounded-3xl transition group',
                ' bg-gray-800 dark:bg-gray-900 text-gray-300 dark:text-gray-100'
            )}
        >
            <div className="flex flex-col text-left">
                <div
                    className={cn(
                        'font-medium transition',
                        'onSuggestionClick:text-gray-300 dark:text-gray-100'
                    )}
                >
                    {title}
                </div>
                <div className="text-sm text-gray-400 dark:text-gray-500">
                    {description}
                </div>
            </div>
            <div className="w-full flex justify-between">
                <div
                    className={cn(
                        'text-xs transition self-center',
                        'text-gray-400 dark:text-gray-500'
                    )}
                >
          Prompt
                </div>
                <div
                    className={cn(
                        'self-end p-1 rounded-lg transition',
                        'bg-gray-700 dark:bg-gray-800 text-gray-300 dark:text-gray-100'
                    )}
                >
                    {/* SVG icon here */}
                </div>
            </div>
        </button>
    </div>
)

const SuggestionsContainer = ({ suggestions, onSuggestionClick }: {
    suggestions: Array<{ title: string, description: string }>
    onSuggestionClick: (title: string) => void
}) => (
    <div
        className={cn(
            'relative w-full flex flex-wrap gap-2 snap-x snap-mandatory overflow-x-auto '
        )}
        id="suggestions-container"
    >
        {suggestions.map((suggestion, index) => (
            <SuggestionButton
                onSuggestionClick={onSuggestionClick}
                key={index}
                title={suggestion.title}
                description={suggestion.description}
            />
        ))}
    </div>
)

export default SuggestionsContainer
