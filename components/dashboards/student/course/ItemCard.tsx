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
    courseId,
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
    >
        <Card className="mb-4 hover:shadow-lg transition-shadow duration-300">
            {image && (
                <div className="relative h-48">
                    <Image src={image} alt={title} layout="fill" objectFit="cover" />
                </div>
            )}
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>{title}</span>
                    <StatusBadge status={status} t={(key) => key} /> {/* Adjust the translation function as needed */}
                </CardTitle>
                {headerDescription && <CardDescription>{headerDescription}</CardDescription>}
            </CardHeader>
            <CardContent>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{description}</p>
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
        </Card>
    </motion.div>
)

export default ItemCard
