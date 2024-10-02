import 'github-markdown-css/github-markdown.css'

import Markdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

import CopyToClipboardButton from '@/components/dashboards/Common/CopyToClipboardButton'

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
                    const code = String(children).replace(/\n$/, '')
                    return !inline && match ? (
                        <div className="relative">
                            <SyntaxHighlighter
                                style={dracula}
                                PreTag="div"
                                language={match[1]}
                                {...props}
                                className="code-block"
                            >
                                {code}
                            </SyntaxHighlighter>
                            <div className="absolute top-2 right-2">
                                <CopyToClipboardButton content={code} />
                            </div>
                        </div>
                    ) : (
                        <code className={`code-inline ${className}`} {...props}>
                            {children}
                        </code>
                    )
                },
                pre({ children, ...props }) {
                    return <pre className="pre-block" {...props}>{children}</pre>
                },
                table({ children, ...props }) {
                    return (
                        <div className="w-full overflow-x-auto max-w-[90vw]">
                            <table className="w-full min-w-full md:min-w-0" {...props}>
                                {children}
                            </table>
                        </div>
                    )
                }

            }}
        >
            {markdown}
        </Markdown>
    )
}
