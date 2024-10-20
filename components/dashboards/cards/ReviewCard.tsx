// ReviewCard.tsx
import { StarIcon } from 'lucide-react'

interface ReviewCardProps {
    rating: number;
    reviewText: string;
    reviewerName: string;
    reviewDate: string;
}

function ReviewCard ({ rating, reviewText, reviewerName, reviewDate }: ReviewCardProps) {
    return (
        <div className="border  rounded-lg p-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {[...Array(5)].map((_, index) => (
                        <StarIcon
                            key={index}
                            className={`w-5 h-5 ${index < rating ? 'fill-yellow-500' : 'fill-gray-300 dark:fill-gray-600'}`}
                        />
                    ))}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{rating} / 5</p>
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{reviewText}</p>
            <div className="mt-4 flex items-center gap-4 justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">{reviewerName}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{reviewDate}</p>
            </div>
        </div>
    )
}

export default ReviewCard
