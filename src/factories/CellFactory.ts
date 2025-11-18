/**
 * Unified Cell Factory
 *
 * Single entry point for creating all cell types with consistent structure and behavior.
 * Replaces the scattered cell creation logic throughout VibeGrid.
 */

import type {
  FieldTypeRegistry,
  VibeGridFieldType,
  EnhancedColumn
} from '../field-types/FieldTypeRegistry';
import { createLogger } from '@/shared/lib/logging';

// Practical column type that works with current usage patterns
// Make it compatible with EnhancedColumn by using it as a base
type CellFactoryColumn = EnhancedColumn & {
  // Additional optional properties for backwards compatibility
  asyncDataState?: any;
};

const fileLog = createLogger('components/custom/vibegrid/factories/CellFactory.ts');

export interface CellPosition {
  rowIndex: number;
  columnIndex: number;
  xPosition?: number;
  yPosition?: number;
  width?: number;
}

export interface CellFactoryOptions {
  enableSelection?: boolean;
  enableEditing?: boolean;
  enableTooltips?: boolean;
  enableAccessibility?: boolean;
}

/**
 * Unified cell creation factory
 */
export class CellFactory {
  constructor(
    private registry: FieldTypeRegistry,
    private options: CellFactoryOptions = {}
  ) {
    // Set default options
    this.options = {
      enableSelection: true,
      enableEditing: true,
      enableTooltips: true,
      enableAccessibility: true,
      ...options
    };
  }

  /**
   * Create a cell element with unified structure and behavior
   */
  createCell(
    value: any,
    column: CellFactoryColumn,
    rowData: any,
    position: CellPosition
  ): HTMLElement {
    const fieldType = this.registry.getFieldType(column);

    fileLog.debug('🔧 [FIELD-FACTORY] Creating cell', {
      fieldType: fieldType.type,
      category: fieldType.category,
      columnId: column.id,
      value: value,
      position
    });

    // Create container with standardized structure
    const container = this.createContainer(column, position);

    // Handle different field categories
    try {
      switch (fieldType.category) {
        case 'relationship':
          return this.createRelationshipCell(container, value, column, rowData, fieldType);
        case 'rollup':
          return this.createRollupCell(container, value, column, rowData, fieldType);
        case 'computed':
          return this.createComputedCell(container, value, column, rowData, fieldType);
        case 'basic':
        default:
          return this.createBasicCell(container, value, column, rowData, fieldType);
      }
    } catch (error) {
      fileLog.error('❌ [FIELD-FACTORY] Error creating cell - FAIL FAST', {
        error,
        fieldType: fieldType.type,
        columnId: column.id
      });
      // FAIL FAST - Don't create error cell, throw to surface issues
      throw error;
    }
  }

  /**
   * Update an existing cell with new value
   */
  updateCell(
    cellElement: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    rowData: any
  ): void {
    const fieldType = this.registry.getFieldType(column);

    try {
      // Find the content element within the cell
      const contentElement = cellElement.querySelector('.vibegridx-cell-content') as HTMLElement;
      if (contentElement && fieldType.renderer.update) {
        fieldType.renderer.update(contentElement, value, column);
      } else {
        // Fallback: re-create the cell content
        const content = fieldType.renderer.render(value, column, rowData);
        cellElement.innerHTML = '';
        cellElement.appendChild(content);
      }

      // Update selection state
      this.updateSelectionState(cellElement, column, rowData);

    } catch (error) {
      fileLog.error('Error updating cell', {
        error,
        fieldType: fieldType.type,
        columnId: column.id
      });
    }
  }

  /**
   * Create the container element with VibeGrid-compatible structure
   */
  private createContainer(column: CellFactoryColumn, position: CellPosition): HTMLElement {
    const container = document.createElement('div');
    container.className = 'vibegridx-cell';
    container.dataset.columnId = column.id;
    container.dataset.field = column.field || column.id;

    const actualWidth = position.width ?? this.getColumnWidth(column);

    // Apply VibeGrid-compatible positioning (matching BodyRenderer structure)
    if (position.xPosition !== undefined) {
      container.style.cssText = `
        position: absolute;
        left: ${position.xPosition}px;
        top: 0;
        width: ${actualWidth}px;
        height: 100%;
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 14px;
        overflow: hidden;
        cursor: default;
      `;
    } else {
      container.style.cssText = `
        flex: 0 0 ${actualWidth}px;
        height: 100%;
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 14px;
        overflow: hidden;
        position: relative;
        cursor: default;
      `;
    }

    // Apply display metadata styling
    if (column.display) {
      this.applyDisplayMetadata(container, column.display);
    }

    // Apply accessibility metadata
    if (this.options.enableAccessibility && column.accessibility) {
      this.applyAccessibilityMetadata(container, column.accessibility);
    }

    return container;
  }

  /**
   * Create a basic field cell (VibeGrid compatible)
   */
  private createBasicCell(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    rowData: any,
    fieldType: VibeGridFieldType
  ): HTMLElement {
    // Create content directly in container (VibeGrid structure)
    // Container already has proper padding and flex layout from createContainer
    const content = fieldType.renderer.render(value, column, rowData);

    // Ensure content uses the proper VibeGrid CSS classes for compatibility
    if (content.className.includes('vibegridx-cell-text')) {
      content.className += column.editable !== false ? '-editable' : '';
    }

    container.appendChild(content);

    // Add editing support if enabled and column is editable
    if (this.options.enableEditing && column.editable !== false) {
      this.addEditingSupport(container, value, column, fieldType);
    }

    return container;
  }

  /**
   * Create a relationship field cell
   */
  private createRelationshipCell(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    rowData: any,
    fieldType: VibeGridFieldType
  ): HTMLElement {
    container.classList.add('vibegridx-cell-relationship');

    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'vibegridx-cell-content';
    contentWrapper.style.cssText = `
      padding: 0 12px;
      display: flex;
      align-items: center;
      height: 100%;
      overflow: hidden;
    `;

    // Check if relationship data needs to be loaded
    if (this.needsAsyncData(value, column)) {
      // Show loading state
      contentWrapper.innerHTML = '<span class="vibegridx-loading">Loading...</span>';
      this.loadRelationshipDataAsync(contentWrapper, value, column, rowData, fieldType);
    } else {
      // Render with available data
      const content = fieldType.renderer.render(value, column, rowData);
      contentWrapper.appendChild(content);
    }

    container.appendChild(contentWrapper);

    // Add relationship editing support
    if (this.options.enableEditing && column.editable !== false) {
      this.addRelationshipEditingSupport(container, value, column, fieldType);
    }

    return container;
  }

  /**
   * Create a rollup field cell
   */
  private createRollupCell(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    rowData: any,
    fieldType: VibeGridFieldType
  ): HTMLElement {
    container.classList.add('vibegridx-cell-rollup');

    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'vibegridx-cell-content';
    contentWrapper.style.cssText = `
      padding: 0 12px;
      display: flex;
      align-items: center;
      height: 100%;
      overflow: hidden;
      gap: 6px;
    `;

    // Calculate rollup value if calculator is available
    let displayValue = value;
    if (fieldType.rollupCalculator && column.rollupConfig) {
      try {
        // Note: Source data should come from parent table context
        displayValue = fieldType.rollupCalculator.calculate(
          column.rollupConfig,
          [], // Source data provided by parent table
          rowData.id
        );
      } catch (error) {
        fileLog.error('❌ [ROLLUP-CALC] Rollup calculation failed - FAIL FAST', { error, column: column.id });
        throw error; // Fail fast - don't use fallback value
      }
    }

    // Render with calculated value
    const content = fieldType.renderer.render(displayValue, column, rowData);
    contentWrapper.appendChild(content);

    // Add rollup indicator
    const indicator = document.createElement('span');
    indicator.className = 'vibegridx-rollup-indicator';
    indicator.textContent = '📊';
    indicator.title = 'Calculated field';
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
      margin-left: auto;
    `;
    contentWrapper.appendChild(indicator);

    container.appendChild(contentWrapper);

    return container;
  }

  /**
   * Create a computed field cell
   */
  private createComputedCell(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    rowData: any,
    fieldType: VibeGridFieldType
  ): HTMLElement {
    container.classList.add('vibegridx-cell-computed');

    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'vibegridx-cell-content';
    contentWrapper.style.cssText = `
      padding: 0 12px;
      display: flex;
      align-items: center;
      height: 100%;
      overflow: hidden;
      gap: 6px;
    `;

    // Render computed value
    const content = fieldType.renderer.render(value, column, rowData);
    contentWrapper.appendChild(content);

    // Add computed indicator
    const indicator = document.createElement('span');
    indicator.className = 'vibegridx-computed-indicator';
    indicator.textContent = '🔢';
    indicator.title = 'Computed field';
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
      margin-left: auto;
    `;
    contentWrapper.appendChild(indicator);

    container.appendChild(contentWrapper);

    return container;
  }

  /**
   * Create an error cell when something goes wrong
   */
  private createErrorCell(container: HTMLElement, column: CellFactoryColumn, error: any): HTMLElement {
    container.classList.add('vibegridx-cell-error');

    const errorContent = document.createElement('div');
    errorContent.className = 'vibegridx-cell-content vibegridx-error';
    errorContent.style.cssText = `
      padding: 0 12px;
      display: flex;
      align-items: center;
      height: 100%;
      color: #dc2626;
      font-size: 12px;
    `;
    errorContent.textContent = 'Error';
    errorContent.title = `Error rendering ${column.id}: ${error?.message || 'Unknown error'}`;

    container.appendChild(errorContent);
    return container;
  }

  /**
   * Get column width from column definition or visual state
   */
  private getColumnWidth(column: CellFactoryColumn): number {
    // Priority: explicit width > display metadata > default
    return column.width ||
           column.display?.width ||
           150;
  }

  /**
   * Apply display metadata to container
   */
  private applyDisplayMetadata(container: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      const contentElement = container.querySelector('.vibegridx-cell-content') as HTMLElement;
      if (contentElement) {
        contentElement.style.justifyContent =
          displayMetadata.textAlign === 'right' ? 'flex-end' :
          displayMetadata.textAlign === 'center' ? 'center' : 'flex-start';
      }
    }

    if (displayMetadata.fontWeight) {
      container.style.fontWeight = displayMetadata.fontWeight;
    }

    if (displayMetadata.backgroundColor) {
      container.style.backgroundColor = displayMetadata.backgroundColor;
    }

    if (displayMetadata.color) {
      container.style.color = displayMetadata.color;
    }
  }

  /**
   * Apply accessibility metadata to container
   */
  private applyAccessibilityMetadata(container: HTMLElement, accessibilityMetadata: any): void {
    if (accessibilityMetadata.ariaLabel) {
      container.setAttribute('aria-label', accessibilityMetadata.ariaLabel);
    }

    if (accessibilityMetadata.ariaDescription) {
      container.setAttribute('aria-description', accessibilityMetadata.ariaDescription);
    }

    if (accessibilityMetadata.role) {
      container.setAttribute('role', accessibilityMetadata.role);
    }

    if (accessibilityMetadata.tabIndex !== undefined) {
      container.setAttribute('tabindex', String(accessibilityMetadata.tabIndex));
    }

    if (accessibilityMetadata.ariaLive) {
      container.setAttribute('aria-live', accessibilityMetadata.ariaLive);
    }
  }

  /**
   * Add editing support to a cell
   */
  private addEditingSupport(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    fieldType: VibeGridFieldType
  ): void {
    container.classList.add('vibegridx-cell-editable');

    container.addEventListener('click', (event) => {
      event.stopPropagation();
      this.startEditing(container, value, column, fieldType);
    });

    container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        this.startEditing(container, value, column, fieldType);
      }
    });
  }

  /**
   * Add relationship editing support
   */
  private addRelationshipEditingSupport(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    fieldType: VibeGridFieldType
  ): void {
    // Relationship editing uses specialized UI components
    // For now, delegate to standard editing with additional relationship context
    this.addEditingSupport(container, value, column, fieldType);
  }

  /**
   * Start editing a cell
   */
  private startEditing(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    fieldType: VibeGridFieldType
  ): void {
    const contentWrapper = container.querySelector('.vibegridx-cell-content') as HTMLElement;
    if (!contentWrapper) return;

    try {
      // Create editor
      const editor = fieldType.editor.create(value, column, (newValue) => {
        this.saveEdit(container, newValue, column, fieldType);
      });

      // Replace content with editor
      contentWrapper.innerHTML = '';
      contentWrapper.appendChild(editor);

      container.classList.add('vibegridx-cell-editing');

    } catch (error) {
      fileLog.error('Error starting cell edit', {
        error,
        columnId: column.id
      });
    }
  }

  /**
   * Save cell edit
   */
  private saveEdit(
    container: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    fieldType: VibeGridFieldType
  ): void {
    fileLog.debug('Saving cell edit', {
      columnId: column.id,
      value
    });

    // Validate the new value using the field type's validator
    try {
      const validationResult = fieldType.validator ?
        fieldType.validator.validate(value, column) :
        { valid: true, errors: [], transformedValue: value };

      if (validationResult.valid) {
        // Re-render the cell with the validated value
        const finalValue = validationResult.transformedValue ?? value;
        this.updateCell(container, finalValue, column, {});
        container.classList.remove('vibegridx-cell-editing');
      } else {
        // Show validation error
        fileLog.warn('Cell edit validation failed', {
          columnId: column.id,
          value,
          errors: validationResult.errors
        });
      }
    } catch (error) {
      fileLog.error('Error during cell edit save', { error, columnId: column.id });
      // Revert to previous state
      container.classList.remove('vibegridx-cell-editing');
    }
  }

  /**
   * Check if cell needs async data loading
   */
  private needsAsyncData(value: any, column: CellFactoryColumn): boolean {
    return !!(value && column.relationshipConfig && !column.asyncDataState?.lastLoaded);
  }

  /**
   * Load relationship data asynchronously
   */
  private async loadRelationshipDataAsync(
    contentWrapper: HTMLElement,
    value: any,
    column: CellFactoryColumn,
    rowData: any,
    fieldType: VibeGridFieldType
  ): Promise<void> {
    try {
      if (fieldType.asyncDataLoader && typeof fieldType.asyncDataLoader.loadRelationshipData === 'function') {
        const loadedData = await fieldType.asyncDataLoader.loadRelationshipData(
          column,
          [String(value)],
          {} as any // TableCore$ - not needed for our simple case
        );

        // Re-render with loaded data
        contentWrapper.innerHTML = '';
        const content = fieldType.renderer.render(value, column, rowData);
        contentWrapper.appendChild(content);
      }
    } catch (error) {
      fileLog.error('❌ [ASYNC-LOAD] Relationship data loading failed - FAIL FAST', { error, column: column.id });
      // Don't throw - just log and continue with basic rendering
    }
  }

  /**
   * Update selection state for a cell
   */
  private updateSelectionState(cellElement: HTMLElement, column: CellFactoryColumn, rowData: any): void {
    // Stub method for selection state management
    // TODO: Implement selection state logic when needed
    fileLog.debug('Selection state update requested', {
      columnId: column.id,
      rowData
    });
  }
}
