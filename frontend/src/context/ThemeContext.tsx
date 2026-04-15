import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
export type DarkPalette = 'default' | 'midnight' | 'forest' | 'ember'
export type LightPalette = 'default' | 'warm' | 'sage' | 'lavender'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
  darkPalette: DarkPalette
  lightPalette: LightPalette
  setDarkPalette: (p: DarkPalette) => void
  setLightPalette: (p: LightPalette) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  darkPalette: 'default',
  lightPalette: 'default',
  setDarkPalette: () => {},
  setLightPalette: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    return (saved === 'light' || saved === 'dark') ? saved : 'dark'
  })

  const [darkPalette, setDarkPaletteState] = useState<DarkPalette>(() => {
    const saved = localStorage.getItem('darkPalette')
    return (['default', 'midnight', 'forest', 'ember'] as DarkPalette[]).includes(saved as DarkPalette)
      ? (saved as DarkPalette)
      : 'default'
  })

  const [lightPalette, setLightPaletteState] = useState<LightPalette>(() => {
    const saved = localStorage.getItem('lightPalette')
    return (['default', 'warm', 'sage', 'lavender'] as LightPalette[]).includes(saved as LightPalette)
      ? (saved as LightPalette)
      : 'default'
  })

  useEffect(() => {
    const root = document.documentElement
    // Remove all theme and palette classes
    root.classList.remove('light', 'dark')
    root.classList.remove('palette-midnight', 'palette-forest', 'palette-ember')
    root.classList.remove('palette-warm', 'palette-sage', 'palette-lavender')

    root.classList.add(theme)

    const palette = theme === 'dark' ? darkPalette : lightPalette
    if (palette !== 'default') {
      root.classList.add(`palette-${palette}`)
    }

    localStorage.setItem('theme', theme)
  }, [theme, darkPalette, lightPalette])

  const toggleTheme = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))
  const setTheme = (t: Theme) => setThemeState(t)

  const setDarkPalette = (p: DarkPalette) => {
    setDarkPaletteState(p)
    localStorage.setItem('darkPalette', p)
  }

  const setLightPalette = (p: LightPalette) => {
    setLightPaletteState(p)
    localStorage.setItem('lightPalette', p)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, darkPalette, lightPalette, setDarkPalette, setLightPalette }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
