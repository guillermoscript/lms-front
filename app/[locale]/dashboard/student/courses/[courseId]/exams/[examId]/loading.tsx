import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

export default function ExamPageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <Skeleton className="h-4 w-full max-w-3xl" />
            </div>

            <div className="mb-8">
                <Skeleton className="h-8 w-3/4 max-w-2xl mb-2" />
                <Skeleton className="h-4 w-full max-w-3xl mb-4" />
                <Skeleton className="h-4 w-32" />
            </div>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle><Skeleton className="h-6 w-48" /></CardTitle>
                </CardHeader>
                <CardContent>
                    {[...Array(4)].map((_, index) => (
                        <div key={index} className="mb-4">
                            <Skeleton className="h-4 w-full max-w-xl mb-2" />
                            <RadioGroup>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="placeholder" id={`true-${index}`} />
                                    <Label htmlFor={`true-${index}`}><Skeleton className="h-4 w-16" /></Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="placeholder" id={`false-${index}`} />
                                    <Label htmlFor={`false-${index}`}><Skeleton className="h-4 w-16" /></Label>
                                </div>
                            </RadioGroup>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle><Skeleton className="h-6 w-48" /></CardTitle>
                </CardHeader>
                <CardContent>
                    {[...Array(5)].map((_, index) => (
                        <div key={index} className="mb-6">
                            <Skeleton className="h-4 w-full max-w-2xl mb-2" />
                            <Textarea placeholder="Enter your answer" />
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle><Skeleton className="h-6 w-48" /></CardTitle>
                </CardHeader>
                <CardContent>
                    {[...Array(3)].map((_, questionIndex) => (
                        <div key={questionIndex} className="mb-6">
                            <Skeleton className="h-4 w-full max-w-xl mb-2" />
                            {[...Array(4)].map((_, optionIndex) => (
                                <div key={optionIndex} className="flex items-center space-x-2 mb-2">
                                    <Checkbox id={`q${questionIndex}-option${optionIndex}`} />
                                    <Label htmlFor={`q${questionIndex}-option${optionIndex}`}>
                                        <Skeleton className="h-4 w-32" />
                                    </Label>
                                </div>
                            ))}
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Button className="w-full md:w-auto">
                <Skeleton className="h-4 w-32" />
            </Button>
        </div>
    )
}
