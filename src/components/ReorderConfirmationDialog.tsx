/**
 * ReorderConfirmationDialog - Confirmation dialog for reordering while sorting is active
 *
 * Shows when user tries to drag-to-reorder rows while a column sort is active.
 * Prompts user to either continue (clear sort and reorder) or cancel.
 */

import { observer } from 'mobx-react-lite'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { useVibeGridStores } from '../stores/context'

export const ReorderConfirmationDialog = observer(function ReorderConfirmationDialog() {
  const { tableCoreStore } = useVibeGridStores()
  const isOpen = tableCoreStore.pendingReorder !== null

  const handleContinue = () => {
    tableCoreStore.confirmPendingReorder()
  }

  const handleCancel = () => {
    tableCoreStore.cancelPendingReorder()
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear sort to reorder?</AlertDialogTitle>
          <AlertDialogDescription>
            This reorder operation will cancel the current sort and create a new unsorted order. Do
            you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleContinue}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
})
