import Image from 'next/image'

interface NoDataPlaceholderProps {
    iconSrc: string
    iconAlt: string
    message: string
    description: string
}

const NoDataPlaceholder: React.FC<NoDataPlaceholderProps> = ({
    iconSrc,
    iconAlt,
    message,
    description,
}) => (
    <div className="flex flex-col items-center justify-center p-6 text-center bg-white dark:bg-gray-800 rounded-lg shadow-md container mx-auto">
        <Image src={iconSrc} alt={iconAlt} width={250} height={250} className="mb-4 rounded-lg" />
        <h2 className="text-xl font-semibold mb-2">{message}</h2>
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
)

export default NoDataPlaceholder
