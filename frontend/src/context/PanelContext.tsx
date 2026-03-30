import { createContext, useContext } from 'react'

interface PanelContextType {
  panelOpen: boolean
}

export const PanelContext = createContext<PanelContextType>({ panelOpen: true })
export const usePanel = () => useContext(PanelContext)
