import React, { createContext, useContext, useState } from 'react'
import type { CustomGroup } from '../lib/api'

interface WorkspaceContextValue {
  activeGroup: CustomGroup | null
  setActiveGroup: (g: CustomGroup | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeGroup: null,
  setActiveGroup: () => {},
})

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeGroup, setActiveGroup] = useState<CustomGroup | null>(null)

  return (
    <WorkspaceContext.Provider value={{ activeGroup, setActiveGroup }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
