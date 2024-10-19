import Image from 'next/image'

export const CourseHeader = ({ title, description, image }) => (
    <div className="relative h-64 md:h-80 mb-8 rounded-lg overflow-hidden">
        <Image src={image} alt={title} fill objectFit="cover" className="brightness-50" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-black/80 to-transparent">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{title}</h1>
            <p className="text-lg text-gray-200">{description}</p>
        </div>
    </div>
)
