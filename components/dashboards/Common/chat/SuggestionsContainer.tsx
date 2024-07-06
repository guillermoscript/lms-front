import { cn } from '@/utils' // Assuming the utility function is located here based on your workspace

const SuggestionButton = ({
    title,
    description,
    onSuggestionClick
}: {
    title: string
    description: string
    onSuggestionClick: (title: string) => void
}) => (
    <div className="snap-center shrink-0">
        <button
            onClick={() => onSuggestionClick(title)}
            className={
                'flex flex-col flex-1 shrink-0 w-64 justify-between h-36 p-5 px-6 rounded-3xl transition group border hover:shadow-md hover:scale-105'
            }
        >
            <div className="flex flex-col text-left">
                <div className={'font-medium transition'}>{title}</div>
                <div className="text-sm ">{description}</div>
            </div>
            <div className="w-full flex justify-between">
                <div className={'text-xs transition self-center'}>Prompt</div>
                <div className={'self-end p-1 rounded-lg transition'}>
                    {/* SVG icon here */}
                </div>
            </div>
        </button>
    </div>
)

const SuggestionsContainer = ({
    suggestions,
    onSuggestionClick
}: {
    suggestions: Array<{ title: string, description: string }>
    onSuggestionClick: (title: string) => void
}) => (
    <div
        className={cn(
            'relative w-full flex p-2 flex-wrap gap-4 snap-x snap-mandatory overflow-x-auto '
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
