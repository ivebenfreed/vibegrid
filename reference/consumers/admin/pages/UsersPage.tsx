/**
 * Platform Admin Users Page
 *
 * User management interface using Vibegrid for high-performance display
 */

import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { UserCog, Mail, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/stores'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { Search as SearchComponent } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { ConfigDrawer } from '@/shared/components/config-drawer'
import { ProfileDropdown } from '@/shared/components/profile-dropdown'
import { VibeGrid, type RowAction } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import { getLogger } from '@/shared/lib/logging'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'

const logger = getLogger(['features', 'admin', 'UsersPage'])

export const UsersPage = observer(function UsersPage() {
  const authStore = useAuth()

  // State for Set Password dialog
  const [setPasswordDialogOpen, setSetPasswordDialogOpen] = useState(false)
  const [passwordUsers, setPasswordUsers] = useState<{ id: string; email: string }[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [isSettingPassword, setIsSettingPassword] = useState(false)

  const handleEntityUpdate = async (userId: string, updates: Record<string, any>) => {
    try {
      // Update user via API
      const response = await fetch(`/api/auth/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.statusText}`)
      }

      logger.info('User updated successfully', { userId, updates })
    } catch (error) {
      logger.error('Failed to update user', { userId, error })
      throw error
    }
  }

  const handleDelete = async (userIds: string[], usersData: any[]) => {
    try {
      logger.info('Deleting users', { userIds, count: userIds.length })

      // Delete each user via API
      await Promise.all(
        userIds.map(async (userId) => {
          const response = await fetch(`/api/auth/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include',
          })

          if (!response.ok) {
            throw new Error(`Failed to delete user ${userId}: ${response.statusText}`)
          }
        }),
      )

      logger.info('Users deleted successfully', { count: userIds.length })

      // Refresh the page to reload data
      window.location.reload()
    } catch (error) {
      logger.error('Failed to delete users', { error })
      throw error
    }
  }

  const deleteConfirmation = (usersData: any[]) => {
    const count = usersData.length
    const userNames = usersData.map((u) => u.name || u.email).join(', ')

    if (count === 1) {
      return `Are you sure you want to delete ${userNames}? This action cannot be undone.`
    }

    return `Are you sure you want to delete ${count} users (${userNames})? This action cannot be undone.`
  }

  // Handle Reset Password (send reset email)
  const handleResetPassword = async (rowIds: string[], rowsData: any[]) => {
    try {
      logger.info('Sending password reset emails', { userIds: rowIds, count: rowIds.length })

      const results = await Promise.allSettled(
        rowIds.map(async (userId) => {
          const response = await fetch(`/api/auth/admin/users/${userId}/send-reset-email`, {
            method: 'POST',
            credentials: 'include',
          })

          if (!response.ok) {
            throw new Error(`Failed to send reset email for user ${userId}: ${response.statusText}`)
          }
          return userId
        }),
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      if (failed > 0) {
        toast.warning(`Sent ${succeeded} reset emails, ${failed} failed.`)
      } else {
        toast.success(`Password reset emails sent to ${succeeded} user(s).`)
      }

      logger.info('Password reset emails sent', { succeeded, failed })
    } catch (error) {
      logger.error('Failed to send reset emails', { error })
      toast.error('Failed to send password reset emails.')
    }
  }

  // Handle Set Password dialog
  const handleSetPasswordClick = (rowIds: string[], rowsData: any[]) => {
    setPasswordUsers(rowsData.map((u) => ({ id: u.id, email: u.email })))
    setNewPassword('')
    setSetPasswordDialogOpen(true)
  }

  const handleSetPasswordConfirm = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }

    setIsSettingPassword(true)
    try {
      logger.info('Setting passwords', { userIds: passwordUsers.map((u) => u.id) })

      const results = await Promise.allSettled(
        passwordUsers.map(async (user) => {
          const response = await fetch('/api/auth/admin/set-user-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              userId: user.id,
              newPassword: newPassword,
            }),
          })

          if (!response.ok) {
            throw new Error(`Failed to set password for ${user.email}: ${response.statusText}`)
          }
          return user.id
        }),
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      if (failed > 0) {
        toast.warning(`Set password for ${succeeded} user(s), ${failed} failed.`)
      } else {
        toast.success(`Password updated for ${succeeded} user(s).`)
      }

      logger.info('Passwords set', { succeeded, failed })
      setSetPasswordDialogOpen(false)
    } catch (error) {
      logger.error('Failed to set passwords', { error })
      toast.error('Failed to set passwords.')
    } finally {
      setIsSettingPassword(false)
    }
  }

  // Handle Impersonate User
  const handleImpersonate = async (rowData: any) => {
    // Prevent impersonating yourself
    if (rowData.id === authStore.userId) {
      toast.error('Cannot impersonate yourself', {
        description: 'You cannot impersonate your own account.',
      })
      return
    }

    // Prevent impersonating super_admin (security)
    if (rowData.role === 'super_admin') {
      toast.error('Cannot impersonate super admin', {
        description: 'Super admin accounts cannot be impersonated for security reasons.',
      })
      return
    }

    try {
      await authStore.impersonateUser(rowData.id)
      toast.success('Impersonation started', {
        description: `You are now impersonating ${rowData.name || rowData.email}`,
      })
      // Redirect to home page as the impersonated user
      window.location.href = '/'
    } catch (error) {
      logger.error('Failed to impersonate user', { error, userId: rowData.id })
      toast.error('Impersonation failed', {
        description: error instanceof Error ? error.message : 'Failed to impersonate user',
      })
    }
  }

  // Define row actions for bulk operations
  const rowActions: RowAction[] = [
    {
      id: 'impersonate',
      label: 'Impersonate User',
      icon: UserCog,
    },
    {
      id: 'reset-password',
      label: 'Reset Password',
      icon: Mail,
    },
    {
      id: 'set-password',
      label: 'Set Password',
      icon: KeyRound,
    },
  ]

  // Handle row action dispatch
  const handleRowAction = async (actionId: string, rowIds: string[], rowsData: any[]) => {
    switch (actionId) {
      case 'impersonate':
        // Impersonate only works on single user
        if (rowsData.length === 1) {
          await handleImpersonate(rowsData[0])
        } else {
          toast.error('Can only impersonate one user at a time')
        }
        break
      case 'reset-password':
        await handleResetPassword(rowIds, rowsData)
        break
      case 'set-password':
        handleSetPasswordClick(rowIds, rowsData)
        break
      default:
        logger.warn('Unknown action', { actionId })
    }
  }

  return (
    <>
      {/* Page Header */}
      <Header>
        <SearchComponent />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-col gap-4 sm:gap-6">
        {/* Page Header with Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="text-sm text-muted-foreground">Manage platform users and roles</p>
          </div>
        </div>

        {/* Vibegrid Container */}
        <div className="flex-1 overflow-hidden">
          <VibeGridStoreProvider tableId="platform-users" entityType="PlatformUser">
            <VibeGrid
              tableId="platform-users"
              entityType="PlatformUser"
              height="calc(100vh - 280px)"
              enableSelectionColumn={true}
              enableGrouping={false}
              enableFiltering={true}
              enableSorting={true}
              enableDragAndDrop={false}
              onEntityUpdate={handleEntityUpdate}
              enableDelete={true}
              onDelete={handleDelete}
              deleteConfirmation={deleteConfirmation}
              rowActions={rowActions}
              onRowAction={handleRowAction}
            />
          </VibeGridStoreProvider>
        </div>
      </Main>

      {/* Set Password Dialog */}
      <Dialog open={setPasswordDialogOpen} onOpenChange={setSetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordUsers.length} user(s):
              <span className="block mt-1 text-foreground font-medium">
                {passwordUsers.map((u) => u.email).join(', ')}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSetPasswordDialogOpen(false)}
              disabled={isSettingPassword}
            >
              Cancel
            </Button>
            <Button onClick={handleSetPasswordConfirm} disabled={isSettingPassword}>
              {isSettingPassword ? 'Setting...' : 'Set Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
