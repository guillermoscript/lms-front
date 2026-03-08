'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconUser, IconSettings } from '@tabler/icons-react'
import { RoleAssignmentDialog } from './role-assignment-dialog'
import Link from 'next/link'

interface Profile {
  id: string
  email: string
  full_name: string | null
  created_at: string
  deactivated_at: string | null
}

interface UsersTableProps {
  profiles: Profile[]
  rolesMap: Map<string, string[]>
  enrollmentCounts: Map<string, number>
}

export function UsersTable({ profiles, rolesMap, enrollmentCounts }: UsersTableProps) {
  const t = useTranslations('dashboard.admin.users.table')
  const { locale } = useParams()
  const dateLocale = locale === 'es' ? es : enUS
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<{
    id: string
    name: string
    roles: string[]
  } | null>(null)
  const router = useRouter()

  // Filter profiles based on search query
  const filteredProfiles = profiles.filter(profile => {
    const searchLower = searchQuery.toLowerCase()
    return (
      profile.full_name?.toLowerCase().includes(searchLower) ||
      profile.email?.toLowerCase().includes(searchLower) ||
      profile.id.toLowerCase().includes(searchLower)
    )
  })

  const handleManageRoles = (profile: Profile) => {
    setSelectedUser({
      id: profile.id,
      name: profile.full_name || profile.email,
      roles: rolesMap.get(profile.id) || []
    })
  }

  return (
    <>
      {/* Search Bar */}
      <div className="mb-4">
        <Input
          type="search"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="pb-3 font-medium">{t('headers.user')}</th>
              <th className="pb-3 font-medium">{t('headers.email')}</th>
              <th className="pb-3 font-medium">{t('headers.roles')}</th>
              <th className="pb-3 font-medium">{t('headers.enrollments')}</th>
              <th className="pb-3 font-medium">{t('headers.status')}</th>
              <th className="pb-3 font-medium">{t('headers.joined')}</th>
              <th className="pb-3 font-medium">{t('headers.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((profile) => {
                const userRolesList = rolesMap.get(profile.id) || []
                const enrollmentCount = enrollmentCounts.get(profile.id) || 0
                const isDeactivated = !!profile.deactivated_at

                return (
                  <tr key={profile.id} className="text-sm">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <IconUser className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {profile.full_name || t('unknown')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {profile.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">{profile.email}</td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1">
                        {userRolesList.length > 0 ? (
                          userRolesList.map((role) => (
                            <Badge
                              key={role}
                              variant={
                                role === 'admin'
                                  ? 'default'
                                  : role === 'teacher'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {t(`roles.${role}`)}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline">{t('roles.noRoles')}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-4">{enrollmentCount}</td>
                    <td className="py-4">
                      {isDeactivated ? (
                        <Badge variant="destructive">{t('status.deactivated')}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                          {t('status.active')}
                        </Badge>
                      )}
                    </td>
                    <td className="py-4 text-muted-foreground">
                      {format(new Date(profile.created_at), 'MMM d, yyyy', { locale: dateLocale })}
                    </td>
                    <td className="py-4">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleManageRoles(profile)}
                        >
                          <IconSettings className="mr-1 h-4 w-4" />
                          {t('actions.roles')}
                        </Button>
                        <Link href={`/dashboard/admin/users/${profile.id}`}>
                          <Button variant="ghost" size="sm">
                            {t('actions.view')}
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t('noUsers')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Role Assignment Dialog */}
      {selectedUser && (
        <RoleAssignmentDialog
          userId={selectedUser.id}
          userName={selectedUser.name}
          currentRoles={selectedUser.roles}
          open={!!selectedUser}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedUser(null)
              router.refresh()
            }
          }}
        />
      )}
    </>
  )
}
