import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type GalleryImage = {
  src: string
  alt: string
  caption: string
}

export type ImageGalleryProps = {
  title: string
  images: GalleryImage[]
  columns: '2' | '3' | '4'
} & SectionSpacingProps

const columnClasses: Record<string, string> = {
  '2': 'grid-cols-2',
  '3': 'grid-cols-2 md:grid-cols-3',
  '4': 'grid-cols-2 md:grid-cols-4',
}

export const ImageGallery: ComponentConfig<ImageGalleryProps> = {
  label: 'Image Gallery',
  fields: {
    title: { type: 'text', label: 'Title' },
    images: {
      type: 'array',
      label: 'Images',
      arrayFields: {
        src: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alt Text' },
        caption: { type: 'text', label: 'Caption' },
      },
      defaultItemProps: { src: 'https://placehold.co/400x300/e2e8f0/64748b?text=Image', alt: 'Gallery image', caption: '' },
    },
    columns: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: '',
    images: Array.from({ length: 6 }, (_, i) => ({
      src: `https://placehold.co/400x300/e2e8f0/64748b?text=Photo+${i + 1}`,
      alt: `Photo ${i + 1}`,
      caption: '',
    })),
    columns: '3',
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, title, images, columns }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!images.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          {title && (
            <h2 className="text-3xl font-bold text-center text-foreground mb-8">{title}</h2>
          )}
          <div className={cn('grid gap-4', columnClasses[columns])}>
            {images.map((img, i) => (
              <figure key={i} className="m-0 overflow-hidden rounded-lg">
                <img
                  src={img.src}
                  alt={img.alt}
                  loading="lazy"
                  className="w-full aspect-4/3 object-cover transition-transform duration-500 hover:scale-105"
                />
                {img.caption && (
                  <figcaption className="text-[0.8125rem] text-muted-foreground mt-2 text-center">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      </div>
    )
  },
}
