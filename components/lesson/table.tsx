import { cn } from '@/lib/utils'

interface TableProps {
  headers: string[]
  rows: string[][]
  striped?: boolean
  className?: string
}

export function Table({ headers, rows, striped, className }: TableProps) {
  return (
    <div className={cn('my-6 overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-border">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-2 text-left font-semibold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                'border-b border-border',
                striped && rowIndex % 2 === 1 && 'bg-muted/50'
              )}
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
