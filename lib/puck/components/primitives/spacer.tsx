import type { ComponentConfig } from '@measured/puck'

export type SpacerProps = {
  height: number
  mobileHeight: number
}

export const Spacer: ComponentConfig<SpacerProps> = {
  label: 'Spacer',
  fields: {
    height: { type: 'number', label: 'Height (px)', min: 0, max: 400 },
    mobileHeight: {
      type: 'number',
      label: 'Mobile Height (px)',
      min: 0,
      max: 200,
    },
  },
  defaultProps: {
    height: 40,
    mobileHeight: 20,
  },
  render: ({ height, mobileHeight }) => {
    const needsResponsive = mobileHeight !== height
    return (
      <>
        {needsResponsive && (
          <style>{`@media (max-width: 768px) { .puck-spacer-${height}-${mobileHeight} { height: ${mobileHeight}px !important; } }`}</style>
        )}
        <div
          style={{ height: `${height}px` }}
          className={needsResponsive ? `puck-spacer-${height}-${mobileHeight}` : undefined}
          aria-hidden="true"
        />
      </>
    )
  },
}
