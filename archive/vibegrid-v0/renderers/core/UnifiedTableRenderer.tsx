// Stub file to satisfy imports during CI build
// This is a placeholder for the unified table renderer functionality

import React from 'react';

export interface UnifiedTableRendererProps {
  [key: string]: any;
}

const UnifiedTableRenderer: React.FC<UnifiedTableRendererProps> = (props) => {
  return (
    <div className="unified-table-renderer-stub">
      <p>UnifiedTableRenderer placeholder</p>
    </div>
  );
};

export default UnifiedTableRenderer;
export { UnifiedTableRenderer };