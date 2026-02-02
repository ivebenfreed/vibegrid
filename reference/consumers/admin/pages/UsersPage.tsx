/**
 * Platform Admin Users Page
 *
 * User management interface using Vibegrid for high-performance display
 */

import { useCallback, useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { UserCog, Mail, KeyRound, Building, X, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/stores'
import { useAdminStore } from '@/features/admin/stores/AdminStoreContext'
import { Main } from '@/shared/components/layout/main'
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
import { Badge } from '@/shared/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

const logger = getLogger(['features', 'admin', 'UsersPage'])

// Organization membership type for the dialog
interface UserOrgMembership {
  id: string
  name: string
  slug: string
  role: string
  joinedAt?: string
}

export const UsersPage = observer(function UsersPage() {
  const authStore = useAuth()
  const adminStore = useAdminStore()

  // State for Set Password dialog
  const [setPasswordDialogOpen, setSetPasswordDialogOpen] = useState(false)
  const [passwordUsers, setPasswordUsers] = useState<{ id: string; email: string }[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [isSettingPassword, setIsSettingPassword] = useState(false)

  // State for Manage Organizations dialog
  const [manageOrgsDialogOpen, setManageOrgsDialogOpen] = useState(false)
  const [manageOrgsUser, setManageOrgsUser] = useState<{
    id: string
    name: string
    email: string
  } | null>(null)
  const [userOrgs, setUserOrgs] = useState<UserOrgMembership[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false)
  const [isAddingOrg, setIsAddingOrg] = useState(false)
  const [isRemovingOrg, setIsRemovingOrg] = useState<string | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [selectedRole, setSelectedRole] = useState('member')

  const handleEntityCreate = async (data: Record<string, any>) => {
    try {
      await adminStore.createUser({
        email: data.email,
        password: data.password || 'TempPass123!',
        name: data.name,
        role: data.role || 'user',
      })
      toast.success('User created successfully')
      window.location.reload()
    } catch (error) {
      logger.error('Failed to create user', { error })
      toast.error(error instanceof Error ? error.message : 'Failed to create user')
    }
  }

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

  const handleDelete = async (userIds: string[], _usersData: any[]) => {
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
  const handleResetPassword = async (rowIds: string[], _rowsData: any[]) => {
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
  const handleSetPasswordClick = (_rowIds: string[], rowsData: any[]) => {
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

  // Load user organizations when dialog opens
  const loadUserOrganizations = useCallback(
    async (userId: string) => {
      setIsLoadingOrgs(true)
      try {
        const orgs = await adminStore.fetchUserOrganizations(userId)
        setUserOrgs(orgs)
      } catch (error) {
        logger.error('Failed to load user organizations', { userId, error })
        toast.error('Failed to load user organizations')
      } finally {
        setIsLoadingOrgs(false)
      }
    },
    [adminStore],
  )

  // Ensure organizations list is available for the org picker
  useEffect(() => {
    if (manageOrgsDialogOpen && adminStore.organizations.length === 0) {
      adminStore.fetchOrganizations().catch((error) => {
        logger.error('Failed to fetch organizations for picker', { error })
      })
    }
  }, [manageOrgsDialogOpen, adminStore])

  // Handle opening the Manage Organizations dialog
  const handleManageOrgsClick = (rowData: any) => {
    setManageOrgsUser({ id: rowData.id, name: rowData.name, email: rowData.email })
    setSelectedOrgId('')
    setSelectedRole('member')
    setManageOrgsDialogOpen(true)
    loadUserOrganizations(rowData.id)
  }

  // Handle adding user to organization
  const handleAddToOrg = async () => {
    if (!selectedOrgId || !manageOrgsUser) {
      toast.error('Please select an organization')
      return
    }

    setIsAddingOrg(true)
    try {
      await adminStore.addUserToOrganization(selectedOrgId, manageOrgsUser.id, selectedRole)
      toast.success('User added to organization')
      setSelectedOrgId('')
      setSelectedRole('member')
      // Refresh the org list
      await loadUserOrganizations(manageOrgsUser.id)
    } catch (error) {
      logger.error('Failed to add user to organization', { error })
      toast.error(error instanceof Error ? error.message : 'Failed to add user to organization')
    } finally {
      setIsAddingOrg(false)
    }
  }

  // Handle removing user from organization
  const handleRemoveFromOrg = async (orgId: string, orgName: string) => {
    if (!manageOrgsUser) return

    setIsRemovingOrg(orgId)
    try {
      await adminStore.removeUserFromOrganization(orgId, manageOrgsUser.id)
      toast.success(`Removed from ${orgName}`)
      // Refresh the org list
      await loadUserOrganizations(manageOrgsUser.id)
    } catch (error) {
      logger.error('Failed to remove user from organization', { error })
      toast.error(
        error instanceof Error ? error.message : 'Failed to remove user from organization',
      )
    } finally {
      setIsRemovingOrg(null)
    }
  }

  // Filter out orgs the user is already a member of
  const availableOrgs = adminStore.organizations.filter(
    (org) => !userOrgs.some((uo) => uo.id === org.id),
  )

  // Define row actions for bulk operations
  const rowActions: RowAction[] = [
    {
      id: 'manage-organizations',
      label: 'Manage Organizations',
      icon: Building,
    },
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
      case 'manage-organizations':
        if (rowsData.length === 1) {
          handleManageOrgsClick(rowsData[0])
        } else {
          toast.error('Can only manage organizations for one user at a time')
        }
        break
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
              onEntityCreate={handleEntityCreate}
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

      {/* Manage Organizations Dialog */}
      <Dialog open={manageOrgsDialogOpen} onOpenChange={setManageOrgsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Organizations</DialogTitle>
            <DialogDescription>
              Manage organization memberships for{' '}
              <span className="text-foreground font-medium">
                {manageOrgsUser?.name || manageOrgsUser?.email}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Current memberships */}
            <div className="grid gap-2">
              <Label>Current Organizations</Label>
              {isLoadingOrgs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading organizations...
                </div>
              ) : userOrgs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Not a member of any organization
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {userOrgs.map((org) => (
                    <Badge
                      key={org.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 py-1 px-2.5"
                    >
                      <span>{org.name}</span>
                      <span className="text-muted-foreground">({org.role})</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromOrg(org.id, org.name)}
                        disabled={isRemovingOrg === org.id}
                        className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 hover:bg-muted transition-opacity disabled:opacity-40"
                        title={`Remove from ${org.name}`}
                      >
                        {isRemovingOrg === org.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Add to organization */}
            <div className="grid gap-2 border-t pt-4">
              <Label>Add to Organization</Label>
              <div className="flex items-end gap-2">
                <div className="flex-1 grid gap-1.5">
                  <Label htmlFor="org-select" className="text-xs text-muted-foreground">
                    Organization
                  </Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select organization..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrgs.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No available organizations
                        </SelectItem>
                      ) : (
                        availableOrgs.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="role-select" className="text-xs text-muted-foreground">
                    Role
                  </Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddToOrg} disabled={isAddingOrg || !selectedOrgId}>
                  {isAddingOrg ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOrgsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
