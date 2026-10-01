import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes safely — resolves conflicts (e.g. bg-red + bg-blue → bg-blue)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
