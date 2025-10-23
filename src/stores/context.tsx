/**
 * VibeGrid Store Context
 *
 * Provides all VibeGrid stores to components via React Context
 */

import React, { createContext, useContext, useMemo, useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { createLogger } from '@/lib/logging'
import { TableCoreStore } from './TableCoreStore'
import { VisualStateStore } from './VisualStateStore'
import { InteractionStore } from './InteractionStore'
import { PersistenceStore } from './PersistenceStore'
import { InitStore } from './InitStore'
import { useSchemaRegistry } from '@/stores'

const log = createLogger('components/vibegrid/stores/context')

// ====================================
// TYPES
// ====================================

export interface VibeGridStores {
  tableCoreStore: TableCoreStore
  visualStateStore: VisualStateStore
  interactionStore: InteractionStore
  persistenceStore: PersistenceStore
  initStore: InitStore
}

export interface VibeGridStoreProviderProps {
  children: React.ReactNode
  entityType: string
  orgId?: string
  tableId?: string
}

// ====================================
// CONTEXT
// ====================================

const VibeGridStoreContext = createContext<VibeGridStores | null>(null)

// ====================================
// PROVIDER
// ====================================

/**
 * Provider component for VibeGrid stores
 * Creates and initializes all stores, provides them to child components
 */
export const VibeGridStoreProvider = observer<VibeGridStoreProviderProps>(
  ({ children, entityType, orgId, tableId = 'default' }) => {
    const [isInitialized, setIsInitialized] = useState(false)
    const [initError, setInitError] = useState<string | null>(null)

    // Get schema registry from root store
    const schemaRegistry = useSchemaRegistry()

    // Create stores once using useMemo
    const stores = useMemo(() => {
      log.info('🏗️ Creating VibeGrid stores', {
        entityType,
        orgId,
        tableId
      })

      // Create all stores
      const tableCoreStore = new TableCoreStore(entityType)
      const visualStateStore = new VisualStateStore()
      const interactionStore = new InteractionStore()
      const persistenceStore = new PersistenceStore(entityType, orgId)
      const initStore = new InitStore(tableId, entityType)

      // Set up dependency injection between stores
      // TableCoreStore needs VisualStateStore for filters, sorting, grouping
      tableCoreStore.setVisualStateInputs(visualStateStore)

      // TableCoreStore needs SchemaRegistry for column generation
      tableCoreStore.setSchemaRegistry(schemaRegistry)

      // PersistenceStore needs all stores to save/load preferences
      persistenceStore.setTableCoreStore(tableCoreStore)
      persistenceStore.setVisualStateStore(visualStateStore)
      persistenceStore.setInteractionStore(interactionStore)

      // InitStore coordinates all stores
      initStore.setTableCoreStore(tableCoreStore)
      initStore.setVisualStateStore(visualStateStore)
      initStore.setInteractionStore(interactionStore)
      initStore.setPersistenceStore(persistenceStore)

      log.info('✅ VibeGrid stores created and wired', {
        entityType,
        tableId
      })

      return {
        tableCoreStore,
        visualStateStore,
        interactionStore,
        persistenceStore,
        initStore
      }
    }, [entityType, orgId, tableId, schemaRegistry])

    // Initialize stores on mount
    useEffect(() => {
      let isMounted = true

      const initializeStores = async () => {
        try {
          log.info('🔄 Initializing VibeGrid stores...', {
            entityType,
            tableId
          })

          await stores.initStore.init()

          if (isMounted) {
            setIsInitialized(true)
            setInitError(null)
            log.info('✅ VibeGrid stores initialized successfully', {
              entityType,
              tableId
            })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          if (isMounted) {
            setInitError(errorMessage)
            log.error('❌ VibeGrid store initialization failed', {
              entityType,
              tableId,
              error: errorMessage
            })
          }
        }
      }

      initializeStores()

      // Cleanup on unmount
      return () => {
        isMounted = false
        log.info('🧹 Cleaning up VibeGrid stores...', {
          entityType,
          tableId
        })

        stores.initStore.dispose()
      }
    }, [stores, entityType, tableId])

    // Show error state if initialization failed
    if (initError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h3 className="font-semibold text-red-800">VibeGrid Initialization Error</h3>
          <p className="text-red-600 text-sm mt-1">{initError}</p>
        </div>
      )
    }

    // Show loading state while initializing
    if (!isInitialized) {
      return (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-600 text-sm">
            Initializing VibeGrid... ({stores.initStore.hydrationProgress}%)
          </p>
        </div>
      )
    }

    // Provide stores to children
    return (
      <VibeGridStoreContext.Provider value={stores}>{children}</VibeGridStoreContext.Provider>
    )
  }
)

VibeGridStoreProvider.displayName = 'VibeGridStoreProvider'

// ====================================
// HOOKS
// ====================================

/**
 * Hook to access VibeGrid stores from components
 * Must be used within VibeGridStoreProvider
 */
export function useVibeGridStores(): VibeGridStores {
  const context = useContext(VibeGridStoreContext)

  if (!context) {
    throw new Error('useVibeGridStores must be used within VibeGridStoreProvider')
  }

  return context
}

/**
 * Hook to access a specific store
 */
export function useTableCoreStore(): TableCoreStore {
  return useVibeGridStores().tableCoreStore
}

export function useVisualStateStore(): VisualStateStore {
  return useVibeGridStores().visualStateStore
}

export function useInteractionStore(): InteractionStore {
  return useVibeGridStores().interactionStore
}

export function usePersistenceStore(): PersistenceStore {
  return useVibeGridStores().persistenceStore
}

export function useInitStore(): InitStore {
  return useVibeGridStores().initStore
}
