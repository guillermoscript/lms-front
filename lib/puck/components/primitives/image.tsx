import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

export type ImageProps = {
  src: string
  alt: string
  width: string
  height: string
  objectFit: 'cover' | 'contain' | 'fill' | 'none'
  borderRadius: string
}

const objectFitMap: Record<string, string> = {
  cover: 'object-cover',
  contain: 'object-contain',
  fill: 'object-fill',
  none: 'object-none',
}

const borderRadiusMap: Record<string, string> = {
  '0': 'rounded-none',
  '0.25rem': 'rounded',
  '0.5rem': 'rounded-lg',
  '1rem': 'rounded-2xl',
  '1.5rem': 'rounded-3xl',
  '9999px': 'rounded-full',
}

export const Image: ComponentConfig<ImageProps> = {
  label: 'Image',
  fields: {
    src: { type: 'text', label: 'Image URL' },
    alt: { type: 'text', label: 'Alt Text' },
    width: { type: 'text', label: 'Width' },
    height: { type: 'text', label: 'Height' },
    objectFit: {
      type: 'select',
      label: 'Object Fit',
      options: [
        { label: 'Cover', value: 'cover' },
        { label: 'Contain', value: 'contain' },
        { label: 'Fill', value: 'fill' },
        { label: 'None', value: 'none' },
      ],
    },
    borderRadius: {
      type: 'select',
      label: 'Border Radius',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '0.25rem' },
        { label: 'Medium', value: '0.5rem' },
        { label: 'Large', value: '1rem' },
        { label: 'XL', value: '1.5rem' },
        { label: 'Full', value: '9999px' },
      ],
    },
  },
  defaultProps: {
    src: 'https://placehold.co/800x400/e2e8f0/64748b?text=Image',
    alt: 'Image',
    width: '100%',
    height: 'auto',
    objectFit: 'cover',
    borderRadius: '0.5rem',
  },
  render: ({ src, alt, width, height, objectFit, borderRadius }) => {
    return (
      <div
        className={cn(
          'overflow-hidden',
          borderRadiusMap[borderRadius] || 'rounded-lg',
        )}
        style={{
          width,
          height: height || 'auto',
        }}
      >
        <img
          src={src}
          alt={alt || 'Image'}
          loading="lazy"
          className={cn(
            'block w-full h-full transition-transform duration-500 hover:scale-[1.02]',
            objectFitMap[objectFit] || 'object-cover',
          )}
        />
      </div>
    )
  },
}
