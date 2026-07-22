import type { ReactElement } from 'react'

/**
 * schema.org JSON-LD builders + renderer for public SEO surfaces.
 * Builders return plain objects; <JsonLd> serializes them into a
 * <script type="application/ld+json"> tag with XSS-safe escaping.
 */

type JsonLdNode = Record<string, unknown>

/**
 * Serialize for embedding inside a <script> tag. User-controlled strings
 * (course titles, descriptions, tenant names) could contain `</script>` or
 * HTML — escape the dangerous characters as unicode sequences, which JSON
 * parsers (and search engines) read identically.
 */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function JsonLd({ data }: { data: JsonLdNode }): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}

interface CourseJsonLdInput {
  name: string
  description?: string | null
  /** Absolute URL of the course page. */
  url: string
  image?: string | null
  providerName: string
  /** Absolute base URL of the tenant site. */
  providerUrl: string
  datePublished?: string | null
  /** Real price/currency of the deterministic product pick; null when free. */
  price?: number | null
  currency?: string | null
  isFree: boolean
  /** Only emitted when there is at least one review. */
  averageRating?: number | null
  reviewCount?: number
}

export function courseJsonLd(input: CourseJsonLdInput): JsonLdNode {
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    url: input.url,
    provider: {
      '@type': 'EducationalOrganization',
      name: input.providerName,
      url: input.providerUrl,
    },
  }
  if (input.description) node.description = input.description
  if (input.image) node.image = input.image
  if (input.datePublished) node.datePublished = input.datePublished

  if (input.isFree) {
    node.isAccessibleForFree = true
    node.offers = { '@type': 'Offer', category: 'Free', price: 0 }
  } else if (input.price != null && input.currency) {
    node.offers = {
      '@type': 'Offer',
      category: 'Paid',
      price: input.price,
      priceCurrency: input.currency.toUpperCase(),
      availability: 'https://schema.org/InStock',
      url: input.url,
    }
  }

  if (
    input.averageRating != null &&
    typeof input.reviewCount === 'number' &&
    input.reviewCount > 0
  ) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round(input.averageRating * 10) / 10,
      reviewCount: input.reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  return node
}

export function itemListJsonLd(items: { url: string; name: string }[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  }
}

export function organizationJsonLd(input: {
  name: string
  url: string
  logo?: string | null
}): JsonLdNode {
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: input.name,
    url: input.url,
  }
  if (input.logo) node.logo = input.logo
  return node
}
