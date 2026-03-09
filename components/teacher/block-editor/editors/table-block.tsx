'use client'

import type { TableBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconTable } from '@tabler/icons-react'

interface TableBlockEditorProps {
  block: TableBlock
  onChange: (updates: Partial<TableBlock>) => void
}

export function TableBlockEditor({ block, onChange }: TableBlockEditorProps) {
  const colCount = block.headers.length

  const addColumn = () => {
    const newHeaders = [...block.headers, `Columna ${colCount + 1}`]
    const newRows = block.rows.map((row) => [...row, ''])
    onChange({ headers: newHeaders, rows: newRows })
  }

  const removeColumn = (colIndex: number) => {
    if (colCount <= 2) return
    const newHeaders = block.headers.filter((_, i) => i !== colIndex)
    const newRows = block.rows.map((row) => row.filter((_, i) => i !== colIndex))
    onChange({ headers: newHeaders, rows: newRows })
  }

  const addRow = () => {
    onChange({ rows: [...block.rows, Array(colCount).fill('')] })
  }

  const removeRow = (rowIndex: number) => {
    if (block.rows.length <= 1) return
    onChange({ rows: block.rows.filter((_, i) => i !== rowIndex) })
  }

  const updateHeader = (colIndex: number, value: string) => {
    const newHeaders = block.headers.map((h, i) => (i === colIndex ? value : h))
    onChange({ headers: newHeaders })
  }

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = block.rows.map((row, ri) =>
      ri === rowIndex
        ? row.map((cell, ci) => (ci === colIndex ? value : cell))
        : row
    )
    onChange({ rows: newRows })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconTable className="h-4 w-4 text-primary" />
          Tabla
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={block.striped ?? false}
            onChange={(e) => onChange({ striped: e.target.checked })}
            className="rounded"
          />
          Filas alternadas
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {block.headers.map((header, colIndex) => (
                <th key={colIndex} className="p-1">
                  <div className="flex items-center gap-1">
                    <Input
                      value={header}
                      onChange={(e) => updateHeader(colIndex, e.target.value)}
                      placeholder={`Col ${colIndex + 1}`}
                      className="h-8 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(colIndex)}
                      disabled={colCount <= 2}
                      className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 shrink-0"
                      aria-label="Eliminar columna"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="p-1">
                    <Input
                      value={cell}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                      placeholder=""
                      className="h-8"
                    />
                  </td>
                ))}
                <td className="p-1 w-8">
                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    disabled={block.rows.length <= 1}
                    className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    aria-label="Eliminar fila"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="flex-1">
          <IconPlus className="h-4 w-4 mr-1" />
          Fila
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addColumn} className="flex-1">
          <IconPlus className="h-4 w-4 mr-1" />
          Columna
        </Button>
      </div>
    </div>
  )
}
