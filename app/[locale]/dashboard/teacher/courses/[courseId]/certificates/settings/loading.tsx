import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"
import { CertificateSettingsFormSkeleton } from "./form-skeleton"

export default function Loading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton back />
      <CertificateSettingsFormSkeleton />
    </PageShell>
  )
}
