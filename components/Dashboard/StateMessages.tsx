import { AlertCircle, Rocket } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '../ui/alert'

export default function StateMessages ({ state }: { state: any }) {
  if (state.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  if (state.status === 'success') {
    return (
      <Alert>
        <Rocket className="h-4 w-4" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  return null
}
