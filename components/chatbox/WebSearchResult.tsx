import { AnimatePresence, motion } from 'framer-motion'
import {
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Search,
} from 'lucide-react'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

import { Badge } from '../ui/badge'

interface WebSearchResult {
    url: string
    title: string
    content: string
}

interface ToolInvocationProps {
    toolName: string
    result: {
        query: string
        answer: string
        results: WebSearchResult[]
    }
}

export default function WebSearchResult({ toolName, result }: ToolInvocationProps) {
    const t = useScopedI18n('WebSearchResult')
    const [isExpanded, setIsExpanded] = useState(false)

    const { query, answer, results } = result

    return (
        <Card className="mt-4 overflow-hidden">
            <CardHeader className="bg-primary text-primary-foreground py-2">
                <CardTitle className="text-sm font-medium flex items-center">
                    <Search className="w-4 h-4 mr-2" />
                    {t('webSearchResults')}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">{t('query')}</Badge>
                        <span className="text-sm font-medium">{query}</span>
                    </div>
                    <p className="text-sm">{answer}</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-left justify-between"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? t('hideResults') : t('showResults')}
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                </div>
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ScrollArea className="h-[300px] mt-2">
                                <div className="space-y-4">
                                    {results.map((result, index) => (
                                        <Card key={index} className="overflow-hidden">
                                            <CardHeader className="p-3">
                                                <CardTitle className="text-sm font-medium">
                                                    <a
                                                        href={result.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary hover:underline flex items-center"
                                                    >
                                                        {result.title}
                                                        <ExternalLink className="w-3 h-3 ml-1" />
                                                    </a>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3 pt-0">
                                                <p className="text-xs text-muted-foreground">{result.content}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </ScrollArea>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
