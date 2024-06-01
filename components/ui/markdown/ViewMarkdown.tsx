import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ViewMarkdown ({
    markdown
}: {
    markdown: string
}) {
    if (!markdown) {
        return null
    }
    return (
        <Markdown
            className={'rich-text markdown-body w-full'}
            remarkPlugins={[remarkGfm]}
        >{markdown}</Markdown>
    )
}
