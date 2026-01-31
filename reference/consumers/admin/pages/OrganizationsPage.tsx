/**
 * Platform Admin Organizations Page
 *
 * Organization management interface using Vibegrid for high-performance display
 */

import { observer } from 'mobx-react-lite'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { Search as SearchComponent } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { ConfigDrawer } from '@/shared/components/config-drawer'
import { ProfileDropdown } from '@/shared/components/profile-dropdown'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import { getLogger } from '@/shared/lib/logging'

const _logger = getLogger(['features', 'admin', 'OrganizationsPage'])

export const OrganizationsPage = observer(function OrganizationsPage() {
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
            />
          </VibeGridStoreProvider>
        </div>
      </Main>
    </>
  )
})
