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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconUsers, IconSettings, IconDotsVertical } from '@tabler/icons-react'
import { RoleAssignmentDialog } from './role-assignment-dialog'
import Link from 'next/link'

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

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
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('headers.user')}</TableHead>
              <TableHead>{t('headers.email')}</TableHead>
              <TableHead>{t('headers.roles')}</TableHead>
              <TableHead>{t('headers.enrollments')}</TableHead>
              <TableHead>{t('headers.status')}</TableHead>
              <TableHead>{t('headers.joined')}</TableHead>
              <TableHead className="text-right">{t('headers.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((profile) => {
                const userRolesList = rolesMap.get(profile.id) || []
                const enrollmentCount = enrollmentCounts.get(profile.id) || 0
                const isDeactivated = !!profile.deactivated_at
                const displayName = profile.full_name || t('unknown')

                return (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback>
                            {getInitials(profile.full_name || profile.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {profile.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{profile.email}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>{enrollmentCount}</TableCell>
                    <TableCell>
                      {isDeactivated ? (
                        <Badge variant="destructive">{t('status.deactivated')}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                          {t('status.active')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(profile.created_at), 'MMM d, yyyy', { locale: dateLocale })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/admin/users/${profile.id}`}>
                          <Button variant="outline" size="sm">
                            {t('actions.view')}
                          </Button>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t('actions.more')}
                              >
                                <IconDotsVertical className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleManageRoles(profile)}>
                              <IconSettings className="h-4 w-4" />
                              {t('actions.roles')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <IconUsers className="h-8 w-8" />
                    <p>{t('noUsers')}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
