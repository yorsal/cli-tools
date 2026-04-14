/**
 * Console utilities for CLI tools
 * Shared color output, readline helpers
 */

import * as readline from 'readline'

// Re-export readline Interface type for use in scripts
export type ReadlineInterface = readline.Interface

// ANSI color codes
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[2m', // dim gray for secondary text
} as const

export type ColorName = keyof typeof colors

/**
 * Apply color to text using ANSI escape codes
 */
export function colorize(text: string | number, color: ColorName): string {
  return `${colors[color]}${text}${colors.reset}`
}

/**
 * Create readline interface for interactive prompts
 */
export function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * Ask user a question, returns trimmed answer
 */
export async function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      resolve(answer.trim())
    })
  })
}

/**
 * Ask user to confirm (yes/no)
 */
export async function confirm(rl: readline.Interface, message: string, defaultValue = false): Promise<boolean> {
  const suffix = defaultValue ? ' (Y/n): ' : ' (y/N): '
  const answer = await question(rl, colorize(message + suffix, 'yellow'))
  if (!answer) return defaultValue
  return answer.toLowerCase() === 'y'
}
