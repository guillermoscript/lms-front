import Image from 'next/image'

interface ImageContainerProps {
    src: string
    alt: string
    className?: string
    height: number
    width: number
}

const ImageContainer: React.FC<ImageContainerProps> = ({
    src,
    alt,
    className,
    height,
    width
}) => (
    <Image
        alt={alt}
        src={src}
        height={height}
        width={width}
        className={`rounded-lg overflow-hidden ${className || ''}`}
        style={{ aspectRatio: `${width}/${height}`, objectFit: 'cover' }}
        placeholder="blur"
        layout="responsive"
        blurDataURL="/img/placeholder.svg"
    />
)

export default ImageContainer
