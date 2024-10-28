import { motion } from 'framer-motion'
import Image from 'next/image'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

import ActionButton from './ActionButton'
import StatusBadge from './StatusBadge'

interface ItemCardProps {
    title: string
    description: string
    status: string
    courseId: string
    actionLink: string
    actionLabel: string
    Icon?: JSX.Element
    headerDescription?: string
    image?: string
    additionalContent?: React.ReactNode
}

const ItemCard: React.FC<ItemCardProps> = ({
    title,
    description,
    status,
    actionLink,
    actionLabel,
    Icon,
    headerDescription,
    image,
    additionalContent,
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className='h-full'
    >
        <Card className="mb-4 hover:shadow-lg transition-shadow duration-300 h-full flex flex-col justify-between">
            {image && (
                <div className="relative h-48">
                    <Image src={image} alt={title} layout="fill" objectFit="cover" />
                </div>
            )}
            <CardHeader className='px-6 pt-6 pb-4'>
                <CardTitle className="flex items-center justify-between flex-wrap space-y-4">
                    <span>{title}</span>
                    <StatusBadge status={status} t={(key) => key} />
                </CardTitle>
                {headerDescription && <CardDescription className='pt-2'>{headerDescription}</CardDescription>}
            </CardHeader>
            <div className='flex flex-col'>
                <CardContent>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-4">{description}</p>
                    {additionalContent}
                </CardContent>
                <CardFooter>
                    <ActionButton
                        status={status}
                        href={actionLink}
                        label={actionLabel}
                        icon={Icon}
                    />
                </CardFooter>
            </div>

        </Card>
    </motion.div>
)

export default ItemCard
