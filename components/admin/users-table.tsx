'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@/lib/format-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DataTableRoot } from '@/components/niko-table/core/data-table-root'
import { DataTable } from '@/components/niko-table/core/data-table'
import {
  DataTableHeader,
  DataTableBody,
  DataTableEmptyBody,
} from '@/components/niko-table/core/data-table-structure'
import { DataTableToolbarSection } from '@/components/niko-table/components/data-table-toolbar-section'
import { DataTableSearchFilter } from '@/components/niko-table/components/data-table-search-filter'
import { DataTableFacetedFilter } from '@/components/niko-table/components/data-table-faceted-filter'
import { DataTableClearFilter } from '@/components/niko-table/components/data-table-clear-filter'
import { DataTablePagination } from '@/components/niko-table/components/data-table-pagination'
import {
  DataTableColumnHeader,
} from '@/components/niko-table/components/data-table-column-header'
import { DataTableColumnTitle } from '@/components/niko-table/components/data-table-column-title'
import { DataTableColumnSortMenu } from '@/components/niko-table/components/data-table-column-sort'
import {
  DataTableEmptyIcon,
  DataTableEmptyMessage,
  DataTableEmptyTitle,
  DataTableEmptyFilteredMessage,
} from '@/components/niko-table/components/data-table-empty-state'
import type { DataTableColumnDef } from '@/components/niko-table/types'
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
  /** Members whose `tenant_users.status` is `banned` (#892). */
  bannedIds: Set<string>
}

type UserStatus = 'active' | 'deactivated' | 'banned'
type UserRole = 'admin' | 'teacher' | 'student' | 'noRoles'
const ROLE_ORDER: UserRole[] = ['admin', 'teacher', 'student']

interface UserRow {
  id: string
  name: string
  email: string
  roles: string[]
  /** Highest role, used by the role facet. */
  role: UserRole
  enrollments: number
  status: UserStatus
  createdAt: string
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function UsersTable({ profiles, rolesMap, enrollmentCounts, bannedIds }: UsersTableProps) {
  const t = useTranslations('dashboard.admin.users.table')
  const locale = useLocale()
  const [selectedUser, setSelectedUser] = useState<{
    id: string
    name: string
    roles: string[]
  } | null>(null)
  const router = useRouter()

  const rows = useMemo<UserRow[]>(
    () =>
      profiles.map((profile) => {
        const roles = rolesMap.get(profile.id) || []
        return {
          id: profile.id,
          name: profile.full_name || t('unknown'),
          email: profile.email,
          roles,
          role: ROLE_ORDER.find((r) => roles.includes(r)) ?? 'noRoles',
          enrollments: enrollmentCounts.get(profile.id) || 0,
          status: bannedIds.has(profile.id)
            ? 'banned'
            : profile.deactivated_at
              ? 'deactivated'
              : 'active',
          createdAt: profile.created_at,
        }
      }),
    [profiles, rolesMap, enrollmentCounts, bannedIds, t],
  )

  const columns = useMemo<DataTableColumnDef<UserRow>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: sortHeader,
        meta: { label: t('headers.user') },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(row.original.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{row.original.name}</p>
              <p className="text-xs text-muted-foreground">{row.original.id.slice(0, 8)}...</p>
            </div>
          </div>
        ),
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: sortHeader,
        meta: { label: t('headers.email') },
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: sortHeader,
        meta: { label: t('headers.roles') },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.length > 0 ? (
              row.original.roles.map((role) => (
                <Badge
                  key={role}
                  variant={role === 'admin' ? 'default' : role === 'teacher' ? 'secondary' : 'outline'}
                >
                  {t(`roles.${role}`)}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">{t('roles.noRoles')}</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'enrollments',
        accessorKey: 'enrollments',
        header: sortHeader,
        meta: { label: t('headers.enrollments'), variant: 'number' },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('headers.status') },
        cell: ({ row }) =>
          row.original.status === 'banned' ? (
            <Badge variant="destructive" data-testid="user-status-banned">
              {t('status.banned')}
            </Badge>
          ) : row.original.status === 'deactivated' ? (
            <Badge variant="destructive">{t('status.deactivated')}</Badge>
          ) : (
            <Badge className="border-success/30 bg-success/10 text-success">
              {t('status.active')}
            </Badge>
          ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: sortHeader,
        meta: { label: t('headers.joined'), variant: 'date' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.createdAt, locale)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('headers.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        size: 160,
        cell: ({ row }) => {
          const user = row.original
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/dashboard/admin/users/${user.id}`} />}
              >
                {t('actions.view')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label={t('actions.more')}>
                      <IconDotsVertical className="h-4 w-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {user.status !== 'banned' && (
                    <DropdownMenuItem
                      onClick={() =>
                        setSelectedUser({ id: user.id, name: user.name, roles: user.roles })
                      }
                    >
                      <IconSettings className="h-4 w-4" />
                      {t('actions.roles')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [t, locale],
  )

  const roleOptions = (['admin', 'teacher', 'student', 'noRoles'] as const).map((r) => ({
    value: r,
    label: t(`roles.${r}`),
  }))
  const statusOptions = (['active', 'deactivated', 'banned'] as const).map((s) => ({
    value: s,
    label: t(`status.${s}`),
  }))

  return (
    <>
      <DataTableRoot
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        config={{ initialPageSize: 25 }}
      >
        <DataTableToolbarSection className="mb-4 flex-wrap">
          <DataTableSearchFilter placeholder={t('searchPlaceholder')} className="max-w-md" />
          <DataTableFacetedFilter accessorKey="role" title={t('headers.roles')} options={roleOptions} multiple />
          <DataTableFacetedFilter accessorKey="status" title={t('headers.status')} options={statusOptions} multiple />
          <DataTableClearFilter />
        </DataTableToolbarSection>
        <DataTable>
          <DataTableHeader />
          <DataTableBody>
            <DataTableEmptyBody>
              <DataTableEmptyIcon>
                <IconUsers className="h-8 w-8" />
              </DataTableEmptyIcon>
              <DataTableEmptyMessage>
                <DataTableEmptyTitle>{t('noUsers')}</DataTableEmptyTitle>
              </DataTableEmptyMessage>
              <DataTableEmptyFilteredMessage>{t('noUsers')}</DataTableEmptyFilteredMessage>
            </DataTableEmptyBody>
          </DataTableBody>
        </DataTable>
        <DataTablePagination defaultPageSize={25} />
      </DataTableRoot>

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
