import {
  aggregationFn_count,
  aggregationFn_extent,
  aggregationFn_first,
  aggregationFn_last,
  aggregationFn_max,
  aggregationFn_mean,
  aggregationFn_median,
  aggregationFn_min,
  aggregationFn_sum,
  aggregationFn_unique,
  aggregationFn_uniqueCount,
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowAggregationFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
  type RowData,
} from "@tanstack/react-table"

import {
  dateRangeFilter,
  extendedFilter,
  numberRangeFilter,
} from "./filter-functions"

/**
 * Feature groups — the composable unit of the engine layer.
 *
 * Each group is a plain object holding the features, row models and named
 * functions one capability needs. Spread the ones your tables use into
 * `tableFeatures({ … })` and the rest never enters the bundle. That is the
 * engine-side mirror of installing only the `DataTable*` pieces you need —
 * you compose by listing what you want, not by toggling flags.
 *
 * @example
 * // A read-only table: columns, sorting, nothing else.
 * export const features = tableFeatures({
 *   ...coreFeatures,
 *   ...sortingFeatures,
 * })
 */

/** Column visibility, ordering, pinning, sizing and resizing. Always useful. */
export const coreFeatures = {
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
} as const

/** Column + global filtering, faceting, and the row models they need. */
export const filteringFeatures = {
  columnFacetingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    extended: extendedFilter,
    numberRange: numberRangeFilter,
    dateRange: dateRangeFilter,
  },
} as const

/**
 * Sorting, plus the sort functions a column may name in `sortFn`.
 *
 * `'auto'` resolves only what is registered here, so drop any your tables
 * never reference.
 */
export const sortingFeatures = {
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
  },
} as const

/** Row expansion — sub-rows and expanded content. Grouping requires it. */
export const expandingFeatures = {
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
} as const

/**
 * Grouping and aggregation, plus the aggregation functions a column may name
 * in `aggregationFn`. Includes `expandingFeatures`, because a group that
 * cannot collapse is not a group.
 *
 * Pairs with `<DataTableGroupedRows>` on the UI side — compose both, or
 * neither.
 */
export const groupingFeatures = {
  ...expandingFeatures,
  columnGroupingFeature,
  rowAggregationFeature,
  groupedRowModel: createGroupedRowModel(),
  aggregationFns: {
    count: aggregationFn_count,
    extent: aggregationFn_extent,
    first: aggregationFn_first,
    last: aggregationFn_last,
    max: aggregationFn_max,
    mean: aggregationFn_mean,
    median: aggregationFn_median,
    min: aggregationFn_min,
    sum: aggregationFn_sum,
    unique: aggregationFn_unique,
    uniqueCount: aggregationFn_uniqueCount,
  },
} as const

/** Client-side pagination. Omit it for server-driven or infinite tables. */
export const paginationFeatures = {
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
} as const

/** Row selection — checkboxes, the selection bar, bulk actions. */
export const selectionFeatures = {
  rowSelectionFeature,
} as const

/**
 * Batteries-included default: every group above.
 *
 * It exists so a fresh install and every copy-paste example work with no
 * setup. It is a starting point, not a recommendation — replace it with the
 * groups your tables actually use and the rest drops out of the bundle.
 */
export const features = tableFeatures({
  ...coreFeatures,
  ...filteringFeatures,
  ...sortingFeatures,
  ...groupingFeatures,
  ...paginationFeatures,
  ...selectionFeatures,
})

export type DataTableFeatures = typeof features

/**
 * Pre-bound column helper for DataTable. TanStack v9's `createColumnHelper`
 * needs the features generic first (`createColumnHelper<DataTableFeatures, TData>()`);
 * this wraps that the same way `DataTableColumnDef<TData>` pre-binds features.
 *
 * Prefer the helper when you want typed `getValue()` in cells. Prefer a plain
 * `DataTableColumnDef<TData>[]` array for dynamic columns and copy-paste examples.
 */
export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>()
}
