/**
 * Format utilities for CLI tools
 * Shared askFormat, askMode and other prompt functions
 */

import * as readline from 'readline'
import { colorize, question } from './console.js'

/**
 * Ask user to select output format
 */
export async function askFormat(rl: readline.Interface): Promise<string> {
  console.log(colorize('\n❓ Output format 输出格式:', 'bright'))
  console.log(colorize('   1) Keep original format 保持原格式', 'gray'))
  console.log(colorize('   2) Convert to jpg 转为 jpg', 'gray'))
  console.log(colorize('   3) Convert to png 转为 png', 'gray'))
  console.log(colorize('   4) Convert to webp 转为 webp', 'gray'))
  const answer = await question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright'))
  const map: Record<string, string> = { '1': 'keep', '2': 'jpg', '3': 'png', '4': 'webp' }
  return map[answer] || 'keep'
}

/**
 * Ask user to select output mode
 */
export async function askMode(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Output mode 输出模式:', 'bright'))
    console.log(colorize('   1) Overwrite original 覆盖原图', 'gray'))
    console.log(colorize('   2) Output to new directory 输出到新目录', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-2): ', 'bright')).then(answer => {
      resolve(answer === '2' ? 'new-dir' : 'overwrite')
    })
  })
}

