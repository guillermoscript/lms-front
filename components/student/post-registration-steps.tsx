import {
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconExternalLink,
  IconFileText,
  IconLink,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export interface PostRegistrationStep {
  id: number
  type: 'whatsapp' | 'telegram' | 'discord' | 'link' | 'text'
  title: string
  description: string | null
  url: string | null
}

interface PostRegistrationStepsProps {
  steps: PostRegistrationStep[]
  title: string
  description: string
  openLabel: string
}

const stepIcons = {
  whatsapp: IconBrandWhatsapp,
  telegram: IconBrandTelegram,
  discord: IconBrandDiscord,
  link: IconLink,
  text: IconFileText,
} as const

/**
 * Post-purchase instructions the admin configured for a product
 * (product_post_registration_steps), shown to the buyer once their
 * purchase is completed.
 */
export function PostRegistrationSteps({
  steps,
  title,
  description,
  openLabel,
}: PostRegistrationStepsProps) {
  if (steps.length === 0) return null

  return (
    <Card className="border-primary/30" data-testid="post-registration-steps">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const Icon = stepIcons[step.type] ?? IconLink
            return (
              <li key={step.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{step.title || `${index + 1}.`}</p>
                  {step.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
                  )}
                  {step.url && (
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block"
                    >
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <IconExternalLink className="size-3.5" aria-hidden />
                        {openLabel}
                      </Button>
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
