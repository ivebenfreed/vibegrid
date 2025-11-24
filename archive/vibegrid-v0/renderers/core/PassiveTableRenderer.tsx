// Stub file to satisfy imports during CI build
// This is a placeholder for the passive table renderer functionality

import React from 'react'

export interface PassiveTableRendererProps {
  [key: string]: any
}

const PassiveTableRenderer: React.FC<PassiveTableRendererProps> = (props) => {
  return (
    <div className="passive-table-renderer-stub">
      <p>PassiveTableRenderer placeholder</p>
    </div>
  )
}

export default PassiveTableRenderer
export { PassiveTableRenderer }
