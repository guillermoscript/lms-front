interface ImageContainerProps {
  src: string
  alt: string
  className?: string
  height: number | string
  width: number | string
}

const ImageContainer: React.FC<ImageContainerProps> = ({
  src,
  alt,
  className,
  height,
  width
}) => (
  <img
    alt={alt}
    src={src}
    height={height}
    width={width}
    className={`rounded-lg overflow-hidden ${className || ''}`}
    style={{ aspectRatio: `${width}/${height}`, objectFit: 'cover' }}
  />
)

export default ImageContainer
