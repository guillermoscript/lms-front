import { Card, CardContent } from '@/components/ui/card'

import ImageContainer from './ImageContainer'

interface ReviewCardProps {
    avatarSrc: string
    name: string
    title: string
    children: React.ReactNode
}

const ReviewCard: React.FC<ReviewCardProps> = ({
    avatarSrc,
    name,
    title,
    children
}) => (
    <Card>
        <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
                <ImageContainer
                    src={avatarSrc}
                    alt={`${name} avatar`}
                    height={48}
                    width={48}
                />
                <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-gray-500 dark:text-gray-400 text-sm">
                        {title}
                    </div>
                </div>
            </div>
            <p className="text-lg font-medium">{children}</p>
        </CardContent>
    </Card>
)

export default ReviewCard
