import type { Fields } from '@measured/puck'
import type { StyleProps } from '../types'

export function getStyleFields(): Fields<StyleProps> {
  return {
    backgroundColor: {
      type: 'text',
      label: 'Background Color',
    },
    backgroundImage: {
      type: 'text',
      label: 'Background Image URL',
    },
    backgroundGradient: {
      type: 'text',
      label: 'Background Gradient',
    },
    overlayOpacity: {
      type: 'number',
      label: 'Overlay Opacity',
      min: 0,
      max: 100,
    },
    paddingTop: {
      type: 'select',
      label: 'Padding Top',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '2rem' },
        { label: 'Large', value: '4rem' },
        { label: 'XL', value: '6rem' },
        { label: '2XL', value: '8rem' },
      ],
    },
    paddingBottom: {
      type: 'select',
      label: 'Padding Bottom',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '2rem' },
        { label: 'Large', value: '4rem' },
        { label: 'XL', value: '6rem' },
        { label: '2XL', value: '8rem' },
      ],
    },
    paddingLeft: {
      type: 'select',
      label: 'Padding Left',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '2rem' },
        { label: 'Large', value: '4rem' },
      ],
    },
    paddingRight: {
      type: 'select',
      label: 'Padding Right',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '2rem' },
        { label: 'Large', value: '4rem' },
      ],
    },
    marginTop: {
      type: 'select',
      label: 'Margin Top',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '2rem' },
        { label: 'Large', value: '4rem' },
      ],
    },
    marginBottom: {
      type: 'select',
      label: 'Margin Bottom',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '2rem' },
        { label: 'Large', value: '4rem' },
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
    borderWidth: {
      type: 'text',
      label: 'Border Width',
    },
    borderColor: {
      type: 'text',
      label: 'Border Color',
    },
    shadow: {
      type: 'select',
      label: 'Shadow',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
        { label: 'XL', value: 'xl' },
      ],
    },
    hideOnMobile: {
      type: 'radio',
      label: 'Hide on Mobile',
      options: [
        { label: 'Show', value: false },
        { label: 'Hide', value: true },
      ],
    },
    hideOnDesktop: {
      type: 'radio',
      label: 'Hide on Desktop',
      options: [
        { label: 'Show', value: false },
        { label: 'Hide', value: true },
      ],
    },
  }
}

// Convert StyleProps to inline styles
export function getStyleFromProps(
  props: Partial<StyleProps>
): React.CSSProperties {
  const style: React.CSSProperties = {}

  if (props.backgroundColor) style.backgroundColor = props.backgroundColor
  if (props.backgroundImage)
    style.backgroundImage = `url(${props.backgroundImage})`
  if (props.backgroundGradient) style.backgroundImage = props.backgroundGradient
  if (props.paddingTop) style.paddingTop = props.paddingTop
  if (props.paddingBottom) style.paddingBottom = props.paddingBottom
  if (props.paddingLeft) style.paddingLeft = props.paddingLeft
  if (props.paddingRight) style.paddingRight = props.paddingRight
  if (props.marginTop) style.marginTop = props.marginTop
  if (props.marginBottom) style.marginBottom = props.marginBottom
  if (props.borderRadius) style.borderRadius = props.borderRadius
  if (props.borderWidth) style.borderWidth = props.borderWidth
  if (props.borderColor) style.borderColor = props.borderColor

  const shadowMap = {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
    xl: '0 20px 25px rgba(0,0,0,0.1)',
  }
  if (props.shadow && props.shadow !== 'none')
    style.boxShadow = shadowMap[props.shadow]

  return style
}

// Get visibility classes
export function getVisibilityClasses(props: Partial<StyleProps>): string {
  const classes: string[] = []
  if (props.hideOnMobile) classes.push('hidden md:block')
  if (props.hideOnDesktop) classes.push('md:hidden')
  return classes.join(' ')
}
