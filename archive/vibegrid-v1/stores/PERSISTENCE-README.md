# VibeGrid Persistence System

## Overview

The VibeGrid persistence system provides automatic saving and loading of user preferences including column order, visibility, widths, sorting, filtering, and grouping configurations. The system is designed to be reliable, consistent, and performant.

## Architecture

### Two-Layer System

1. **Visual State Layer** (`visual-state.ts`)
   - Loads saved preferences during initialization
   - Provides reactive observables for UI components
   - Handles default state creation with preference merging

2. **Simple Persistence Layer** (`simple-persistence.ts`)
   - Manages localStorage read/write operations
   - Provides CRUD operations for individual preference types
   - Handles storage key normalization and organization isolation

### Data Flow

```
User Action → Visual State Observable → onChange Handler → Simple Persistence → localStorage
    ↑                                                                              ↓
User Interface ← Visual State Loading ← Preference Merging ← Simple Persistence ← localStorage
```

## Key Features

### ✅ Reliable Column Order Persistence
- Handles drag-and-drop column reordering
- Falls back to default order when saved order is empty
- Preserves user customizations during column updates

### ✅ Consistent onChange Handlers
All persistence handlers follow the same pattern:
```typescript
visualState.visualInputs$.{property}.onChange((newValue) => {
  try {
    fileLog.info('[PERSIST] 🔔 {property} onChange triggered', { newValue });
    const actualValue = newValue?.value || newValue;
    fileLog.info('[PERSIST] 🔍 Extracted {property} data', { actualValue });

    if (isValid(actualValue)) {
      simplePersistence.operations.set{Property}(actualValue);
      fileLog.info('[PERSIST] 💾 SAVED {property} to localStorage', { actualValue });
    } else {
      fileLog.warn('[PERSIST] 🚨 Rejecting invalid {property} data', { actualValue });
    }
  } catch (error) {
    fileLog.error('❌ Error in {property} onChange callback', { error });
  }
});
```

### ✅ Single Loading Source
- All preferences loaded once during `initializeColumns()`
- No duplicate loading mechanisms to cause conflicts
- Proper preservation during column updates

### ✅ Organization Isolation
- Storage keys include organization ID: `vibegrid-simple-{orgId}_{entityType}`
- Prevents data leakage between organizations
- Handles entity type normalization correctly

## Supported Preferences

| Preference | Type | Description |
|------------|------|-------------|
| `columnOrder` | `string[]` | Column display order from drag-and-drop |
| `columnVisibility` | `Record<string, boolean>` | Show/hide state per column |
| `columnWidths` | `Record<string, number>` | Custom column widths in pixels |
| `sortBy` | `SortConfig[]` | Multi-column sorting configuration |
| `filters` | `FilterConfig[]` | Applied filter conditions |
| `groupConfig` | `GroupConfig` | Grouping fields and settings |

## Usage

### Automatic Persistence
All preferences are automatically saved when users interact with the grid:
- Column reordering via drag-and-drop
- Column resizing via drag handles
- Show/hide columns via visibility controls
- Sorting via column headers
- Filtering via filter inputs
- Grouping via grouping controls

### Manual Operations
```typescript
// Access persistence instance
const simplePersistence = createVibeGridPreferences(entityType, orgId);

// Save specific preferences
simplePersistence.operations.setColumnOrder(['id', 'title', 'status']);
simplePersistence.operations.setColumnVisibility({ id: true, secret: false });

// Load all preferences
const prefs = simplePersistence.preferences$.get();

// Clear all preferences
simplePersistence.operations.clearAll();
```

## Debugging

### Log Filtering
All persistence operations use the `[PERSIST]` prefix for easy filtering:
```javascript
// In browser console - filter for persistence logs only
console.log(logs.filter(log => log.includes('[PERSIST]')));
```

### Common Log Patterns
- `🔔 {property} onChange triggered` - User action detected
- `🔍 Extracted {property} data` - Data extraction from Legend State
- `✅ Validation result` - Data validation outcome
- `💾 SAVED {property} to localStorage` - Successful save
- `🚨 Rejecting invalid {property} data` - Validation failure
- `📋 DETAILED COLUMN ORDER LOADING` - Initialization details

### Storage Inspection
```javascript
// View raw localStorage data
const storageKey = 'vibegrid-simple-{orgId}_{entityType}';
console.log(JSON.parse(localStorage.getItem(storageKey)));

// Clear specific grid preferences
localStorage.removeItem(storageKey);
```

## Troubleshooting

### Column Order Not Persisting
1. Check logs for `[PERSIST] 💾 SAVED columnOrder` messages
2. Verify storage key format doesn't have double org IDs
3. Ensure `finalColumnOrder` isn't empty array during initialization

### Sort/Group State Conflicts
1. Verify consistent onChange handler patterns
2. Check for duplicate loading mechanisms
3. Ensure timing of preference application

### Empty Grid Body
1. Check if `columnOrder` is empty array instead of default order
2. Verify `columns.set()` preservation logic
3. Confirm visual state initialization completed

## File Structure

```
src/components/custom/vibegrid/stores/
├── PERSISTENCE-README.md          # This documentation
├── visual-state.ts                # Visual state management & loading
├── simple-persistence.ts          # localStorage operations
└── data-state.ts                 # Core data processing
```

## Best Practices

### For Developers
1. **Never bypass onChange handlers** - Always modify through visual state observables
2. **Use consistent logging** - Include `[PERSIST]` prefix in all persistence logs
3. **Validate before saving** - Check data structure before localStorage writes
4. **Handle empty states** - Account for empty arrays/objects in fallback logic

### For Debugging
1. **Filter logs by `[PERSIST]`** - Focus on persistence-specific operations
2. **Check storage keys** - Verify organization isolation is working
3. **Trace data flow** - Follow: user action → onChange → validation → save
4. **Test edge cases** - Empty data, invalid data, rapid changes

## Migration Notes

### From Neon to Direct PostgreSQL
The persistence system is localStorage-based and unaffected by database migrations.

### From Duplicate Loading Systems
- Removed conflicting persistence loading from VibeGrid component
- Consolidated all loading into visual state initialization
- Fixed timing issues with preference application

## Performance Considerations

- **Debounced saves** for rapid changes (groupConfig uses 100ms debounce)
- **Batch operations** during initialization to prevent excessive updates
- **Minimal localStorage writes** through validation and deduplication
- **Efficient data structures** with Record<string, T> for O(1) lookups