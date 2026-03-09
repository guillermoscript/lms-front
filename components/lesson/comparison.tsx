import { Compare } from './compare'

interface ComparisonProps {
  sideA: { title: string; points: string[]; highlight: 'positive' | 'negative' | 'neutral' }
  sideB: { title: string; points: string[]; highlight: 'positive' | 'negative' | 'neutral' }
  summary?: string
  className?: string
}

function PointsList({ points }: { points: string[] }) {
  return (
    <ul className="list-disc pl-4 space-y-1">
      {points.map((point, i) => (
        <li key={i} className="text-sm">{point}</li>
      ))}
    </ul>
  )
}

export function Comparison({ sideA, sideB, summary, className }: ComparisonProps) {
  return (
    <div>
      <Compare
        left={{
          title: sideA.title,
          content: <PointsList points={sideA.points} />,
          highlight: sideA.highlight,
        }}
        right={{
          title: sideB.title,
          content: <PointsList points={sideB.points} />,
          highlight: sideB.highlight,
        }}
        className={className}
      />
      {summary && (
        <p className="mt-2 text-sm text-muted-foreground italic px-1">{summary}</p>
      )}
    </div>
  )
}
