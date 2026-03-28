import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names with tailwind-merge
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as USD currency string
 * e.g. 1234.56 → "$1,234.56"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format an ISO date string as "Mar 15, 2024"
 */
export function formatDate(date: string): string {
  if (!date) return ''
  // Parse as local date to avoid timezone offset issues (handles both "T" and space separators)
  const parts = date.split(/T| /)[0].split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format "YYYY-MM" string as "Mar 2024"
 */
export function formatMonth(month: string): string {
  if (!month) return ''
  const [year, mon] = month.split('-')
  const d = new Date(Number(year), Number(mon) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * Truncate a string to maxLen chars, adding ellipsis if needed
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

/**
 * Get chart color by index from the palette
 */
const DARK_CHART_COLORS = ['#c8ff00', '#5abf8a', '#e86060', '#7aaed4', '#e8c17a', '#c47adb']
const LIGHT_CHART_COLORS = ['#82c9a0', '#7aaed4', '#e89898', '#a8c8e8', '#e8d4a0', '#c4a0d4']

export function getChartColor(index: number, theme: 'dark' | 'light' = 'dark'): string {
  const palette = theme === 'dark' ? DARK_CHART_COLORS : LIGHT_CHART_COLORS
  return palette[index % palette.length]
}

export const CHART_COLORS_DARK = DARK_CHART_COLORS
export const CHART_COLORS_LIGHT = LIGHT_CHART_COLORS
