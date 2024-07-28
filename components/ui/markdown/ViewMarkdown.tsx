import 'github-markdown-css/github-markdown.css'

import Markdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

export default function ViewMarkdown({
    markdown,
    addLinks,
}: {
    markdown: string;
    addLinks?: boolean;
}) {
    if (!markdown) {
        return null
    }

    return (
        <Markdown
            className={'rich-text markdown-body w-full'}
            remarkPlugins={[[remarkGfm, { tight: true, maxDepth: 5 }]]}
            rehypePlugins={addLinks ? [rehypeRaw, rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }], remarkRehype] : [rehypeRaw]}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    return !inline && match ? (
                        <SyntaxHighlighter
                            style={dracula}
                            PreTag="div"
                            language={match[1]}
                            {...props}
                            className="code-block"
                        >
                            {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                    ) : (
                        <code
                            className={`code-inline ${className}`}
                            {...props}
                        >
                            {children}
                        </code>
                    )
                },
                pre({ children, ...props }) {
                    return <pre className="pre-block" {...props}>{children}</pre>
                },
            }}
        >
            {markdown}
        </Markdown>
    )
}
