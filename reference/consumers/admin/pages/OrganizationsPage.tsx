/**
 * Platform Admin Organizations Page
 *
 * Organization management interface using Vibegrid for high-performance display
 * with Create dialog and Archive/Restore row actions.
 */

import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { Search as SearchComponent } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { ConfigDrawer } from '@/shared/components/config-drawer'
import { ProfileDropdown } from '@/shared/components/profile-dropdown'
import { VibeGrid, type RowAction } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import { useAdminStore } from '@/features/admin/stores/AdminStoreContext'
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

const logger = getLogger(['features', 'admin', 'OrganizationsPage'])

export const OrganizationsPage = observer(function OrganizationsPage() {
  const adminStore = useAdminStore()

  // Create Organization dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Auto-generate slug from name
  const handleNameChange = (value: string): void => {
    setOrgName(value)
    // Auto-slug: lowercase, replace spaces with hyphens, remove special chars
    setOrgSlug(
      value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
    )
  }

  const handleCreateOrganization = async (): Promise<void> => {
    if (!orgName.trim() || !orgSlug.trim() || !ownerId.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsCreating(true)
    try {
      await adminStore.createOrganization({
        name: orgName.trim(),
        slug: orgSlug.trim(),
        ownerId: ownerId.trim(),
      })
      toast.success(`Organization "${orgName}" created`)
      setCreateDialogOpen(false)
      setOrgName('')
      setOrgSlug('')
      setOwnerId('')
      // Reload page to refresh grid data
      window.location.reload()
    } catch (error) {
      logger.error('Failed to create organization', { error })
      toast.error(error instanceof Error ? error.message : 'Failed to create organization')
    } finally {
      setIsCreating(false)
    }
  }

  // Archive organization handler
  const handleArchive = async (rowIds: string[]): Promise<void> => {
    try {
      await Promise.all(rowIds.map((id) => adminStore.archiveOrganization(id)))
      const count = rowIds.length
      toast.success(`${count} organization(s) archived`)
      window.location.reload()
    } catch (error) {
      logger.error('Failed to archive organizations', { error })
      toast.error('Failed to archive organizations')
    }
  }

  // Restore organization handler
  const handleRestore = async (rowIds: string[]): Promise<void> => {
    try {
      await Promise.all(rowIds.map((id) => adminStore.restoreOrganization(id)))
      const count = rowIds.length
      toast.success(`${count} organization(s) restored`)
      window.location.reload()
    } catch (error) {
      logger.error('Failed to restore organizations', { error })
      toast.error('Failed to restore organizations')
    }
  }

  // Row actions
  const rowActions: RowAction[] = [
    {
      id: 'archive',
      label: 'Archive',
      icon: Archive,
    },
    {
      id: 'restore',
      label: 'Restore',
      icon: ArchiveRestore,
    },
  ]

  const handleRowAction = async (
    actionId: string,
    rowIds: string[],
    _rowsData: unknown[],
  ): Promise<void> => {
    switch (actionId) {
      case 'archive':
        await handleArchive(rowIds)
        break
      case 'restore':
        await handleRestore(rowIds)
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
            <h1 className="text-2xl font-bold tracking-tight">Organization Management</h1>
            <p className="text-sm text-muted-foreground">Manage platform organizations</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </div>

        {/* Vibegrid Container */}
        <div className="flex-1 overflow-hidden">
          <VibeGridStoreProvider tableId="platform-organizations" entityType="PlatformOrganization">
            <VibeGrid
              tableId="platform-organizations"
              entityType="PlatformOrganization"
              height="calc(100vh - 280px)"
              enableSelectionColumn={true}
              enableGrouping={false}
              enableFiltering={true}
              enableSorting={true}
              enableDragAndDrop={false}
              rowActions={rowActions}
              onRowAction={handleRowAction}
            />
          </VibeGridStoreProvider>
        </div>
      </Main>

      {/* Create Organization Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization. The owner will be added as the first member.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="My Organization"
                value={orgName}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                placeholder="my-organization"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="owner-id">Owner User ID</Label>
              <Input
                id="owner-id"
                placeholder="User ID (from Users tab)"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateOrganization} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
