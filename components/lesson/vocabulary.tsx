'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { IconVolume, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react'

interface VocabularyProps {
  word: string
  translation?: string
  pronunciation?: string // IPA o texto fonético
  audio?: string // URL del audio
  example?: string
  exampleTranslation?: string
  image?: string
  className?: string
}

export function Vocabulary({
  word,
  translation,
  pronunciation,
  audio,
  example,
  exampleTranslation,
  image,
  className,
}: VocabularyProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const handlePlayAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      } else {
        audioRef.current.play()
      }
    }
  }

  const handleAudioEnd = () => {
    setIsPlaying(false)
  }

  const handleAudioPlay = () => {
    setIsPlaying(true)
  }

  const handleAudioPause = () => {
    setIsPlaying(false)
  }

  return (
    <div
      className={cn(
        'my-4 flex gap-4 rounded-lg border bg-card p-4 shadow-sm',
        className
      )}
    >
      {image && (
        <div className="shrink-0">
          <img
            src={image}
            alt={word}
            className="size-20 rounded-md object-cover"
          />
        </div>
      )}

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">{word}</span>
          
          {audio && (
            <>
              <audio
                ref={audioRef}
                src={audio}
                onEnded={handleAudioEnd}
                onPlay={handleAudioPlay}
                onPause={handleAudioPause}
                preload="none"
              />
              <button
                type="button"
                onClick={handlePlayAudio}
                className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                aria-label={isPlaying ? 'Pausar audio' : 'Reproducir pronunciación'}
              >
                {isPlaying ? (
                  <IconPlayerPause className="size-4" />
                ) : (
                  <IconVolume className="size-4" />
                )}
              </button>
            </>
          )}
          
          {pronunciation && (
            <span className="text-sm text-muted-foreground">
              /{pronunciation}/
            </span>
          )}
        </div>

        {translation && (
          <p className="text-sm font-medium text-muted-foreground">
            {translation}
          </p>
        )}

        {example && (
          <div className="mt-3 rounded-md bg-muted/50 p-3">
            <p className="text-sm italic">&ldquo;{example}&rdquo;</p>
            {exampleTranslation && (
              <p className="mt-1 text-xs text-muted-foreground">
                {exampleTranslation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Componente para mostrar una lista de vocabulario
interface VocabularyListProps {
  items: VocabularyProps[]
  className?: string
}

export function VocabularyList({ items, className }: VocabularyListProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, index) => (
        <Vocabulary key={index} {...item} />
      ))}
    </div>
  )
}
