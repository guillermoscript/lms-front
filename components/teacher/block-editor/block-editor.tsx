'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { nanoid } from 'nanoid'
import type { Block, BlockType } from './types'
import { createBlock, BLOCK_METAS } from './types'
import { blocksToMdx, mdxToBlocks } from './serializer'
import { SortableBlock } from './sortable-block'
import { BlockRenderer } from './block-renderer'
import { AddBlockMenu } from './add-block-menu'
import { cn } from '@/lib/utils'

interface BlockEditorProps {
  initialContent?: string
  onChange?: (mdx: string) => void
  className?: string
}

export function BlockEditor({ initialContent = '', onChange, className }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => {
    if (!initialContent) {
      return [createBlock('text')]
    }
    const parsed = mdxToBlocks(initialContent)
    return parsed.length > 0 ? parsed : [createBlock('text')]
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const emitChange = useCallback(
    (newBlocks: Block[]) => {
      const mdx = blocksToMdx(newBlocks)
      onChange?.(mdx)
    },
    [onChange]
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((b) => b.id === active.id)
        const newIndex = items.findIndex((b) => b.id === over.id)
        const newItems = arrayMove(items, oldIndex, newIndex)
        emitChange(newItems)
        return newItems
      })
    }
  }

  const updateBlock = (id: string, updates: Partial<Block>) => {
    setBlocks((items) => {
      const newItems = items.map((b) =>
        b.id === id ? ({ ...b, ...updates } as Block) : b
      )
      emitChange(newItems)
      return newItems
    })
  }

  const deleteBlock = (id: string) => {
    setBlocks((items) => {
      const newItems = items.filter((b) => b.id !== id)
      // Keep at least one block
      if (newItems.length === 0) {
        const empty = createBlock('text')
        emitChange([empty])
        return [empty]
      }
      emitChange(newItems)
      return newItems
    })
  }

  const addBlockAfter = (afterId: string | null, type: BlockType) => {
    const newBlock = createBlock(type)
    setBlocks((items) => {
      let newItems: Block[]
      if (afterId === null) {
        newItems = [newBlock, ...items]
      } else {
        const idx = items.findIndex((b) => b.id === afterId)
        newItems = [...items.slice(0, idx + 1), newBlock, ...items.slice(idx + 1)]
      }
      emitChange(newItems)
      return newItems
    })
  }

  const duplicateBlock = (id: string) => {
    setBlocks((items) => {
      const idx = items.findIndex((b) => b.id === id)
      if (idx === -1) return items
      const original = items[idx]
      const copy = { ...original, id: nanoid() }
      const newItems = [...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)]
      emitChange(newItems)
      return newItems
    })
  }

  const moveBlockUp = (id: string) => {
    setBlocks((items) => {
      const idx = items.findIndex((b) => b.id === id)
      if (idx <= 0) return items
      const newItems = arrayMove(items, idx, idx - 1)
      emitChange(newItems)
      return newItems
    })
  }

  const moveBlockDown = (id: string) => {
    setBlocks((items) => {
      const idx = items.findIndex((b) => b.id === id)
      if (idx === -1 || idx >= items.length - 1) return items
      const newItems = arrayMove(items, idx, idx + 1)
      emitChange(newItems)
      return newItems
    })
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Add block at top */}
      <AddBlockMenu onSelect={(type: BlockType) => addBlockAfter(null, type)} position="top" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block, index) => (
              <SortableBlock
                key={block.id}
                id={block.id}
                isFirst={index === 0}
                isLast={index === blocks.length - 1}
                onDelete={() => deleteBlock(block.id)}
                onDuplicate={() => duplicateBlock(block.id)}
                onMoveUp={() => moveBlockUp(block.id)}
                onMoveDown={() => moveBlockDown(block.id)}
                onAddAfter={(type: BlockType) => addBlockAfter(block.id, type)}
              >
                <BlockRenderer
                  block={block}
                  onChange={(updates: Partial<Block>) => updateBlock(block.id, updates)}
                />
              </SortableBlock>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
