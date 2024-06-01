import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card'
import { ClipboardIcon } from 'lucide-react'

export default function TestCards () {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Tests</CardTitle>
        <CardDescription>
          View and prepare for your upcoming tests.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
              <ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">
                Introduction to Web Development
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Due: April 15, 2023
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
              <ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">
                Intermediate JavaScript
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Due: May 1, 2023
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
              <ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">
                Foundations of Data Science
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Due: June 1, 2023
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
