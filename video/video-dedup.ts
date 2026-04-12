#!/usr/bin/env tsx

/**
 * Video Deduplication Tool
 *
 * Remove redundant frames from video using ffmpeg mpdecimate filter
 * Usage: tsx video/video-dedup.ts --input <file or directory> [options]
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as readline from 'readline'

const execAsync = promisify(exec)

// CLI argument types
interface CliArgs {
  input?: string
  output?: string
  yes?: boolean
  help?: boolean
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' || arg === '-i') result.input = args[++i]
    else if (arg === '--output' || arg === '-o') result.output = args[++i]
    else if (arg === '--yes' || arg === '-y') result.yes = true
    else if (arg === '--help' || arg === '-H') result.help = true
  }
  return result
}

function showHelp(): void {
  console.log(`
🎬 Video Deduplication Tool

Usage: tsx video/video-dedup.ts --input <file or directory> [options]

Required:
  --input, -i <path>      Source video file or directory

Options:
  --output, -o <path>    Output path (default: input_dedup)
  --yes, -y              Skip confirmation prompt
  --help, -H             Show this help message

Examples:
  tsx video/video-dedup.ts -i input.mp4
  tsx video/video-dedup.ts -i input.mp4 -o output_dedup.mp4
  tsx video/video-dedup.ts -i ./videos --yes
`)
}

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

type ColorName = keyof typeof colors

function colorize(text: string | number, color: ColorName): string {
  return `${colors[color]}${text}${colors.reset}`
}

// Readline helper
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

async function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      resolve(answer.trim())
    })
  })
}

// Supported video extensions
const SUPPORTED_EXTENSIONS = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg']

function getVideoFiles(dir: string): string[] {
  const files = fs.readdirSync(dir)
  return files
    .filter(file => {
      const ext = path.extname(file).toLowerCase()
      return SUPPORTED_EXTENSIONS.includes(ext)
    })
    .map(f => path.join(dir, f))
}

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

async function checkFfmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version')
    return true
  } catch {
    return false
  }
}

function quotePath(path: string): string {
  if (path.includes(' ')) {
    return `"${path}"`
  }
  return path
}

async function dedupVideo(inputPath: string, outputPath: string): Promise<void> {
  // Use mpdecimate filter with light settings (方案A)
  // hi=768:lo=640:frac=0.1 - only remove truly redundant frames
  const args = [
    '-y',
    '-i', quotePath(inputPath),
    '-vf', 'mpdecimate=hi=768:lo=640:frac=0.1',
    '-c:a', 'copy',
    '-c:v', 'libx264',
    '-preset', 'fast',
    quotePath(outputPath),
  ]

  const command = `ffmpeg ${args.join(' ')}`
  await execAsync(command)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate required arguments
  if (!args.input) {
    console.error(colorize('❌ 请指定输入: --input <file or directory>', 'red'))
    console.log('   使用 --help 查看帮助')
    process.exit(1)
  }

  const inputPath = path.resolve(args.input)

  // Check if input exists
  if (!fs.existsSync(inputPath)) {
    console.error(colorize(`❌ 输入路径不存在: ${inputPath}`, 'red'))
    process.exit(1)
  }

  // Check ffmpeg availability
  const hasFfmpeg = await checkFfmpeg()
  if (!hasFfmpeg) {
    console.error(colorize('❌ 未找到 ffmpeg，请先安装 ffmpeg', 'red'))
    console.log('   安装方式:')
    console.log('   macOS: brew install ffmpeg')
    console.log('   Ubuntu/Debian: sudo apt install ffmpeg')
    console.log('   Windows: winget install ffmpeg')
    process.exit(1)
  }

  const isDir = fs.statSync(inputPath).isDirectory()
  let filesToProcess: string[]

  if (isDir) {
    filesToProcess = getVideoFiles(inputPath)
    if (filesToProcess.length === 0) {
      console.error(colorize(`❌ 目录中没有找到支持的视频格式`, 'yellow'))
      process.exit(1)
    }
  } else {
    if (!isVideoFile(inputPath)) {
      console.error(colorize(`❌ 不支持的视频格式: ${inputPath}`, 'red'))
      process.exit(1)
    }
    filesToProcess = [inputPath]
  }

  console.log(colorize('\n🎬 视频去重工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  发现 ${filesToProcess.length} 个视频文件\n`, 'cyan'))

  const rl = createInterface()

  // Determine output path
  let outputPath: string
  if (args.output) {
    outputPath = path.resolve(args.output)
  } else if (isDir) {
    outputPath = `${inputPath}_dedup`
  } else {
    const ext = path.extname(inputPath)
    const base = path.basename(inputPath, ext)
    outputPath = path.join(path.dirname(inputPath), `${base}_dedup${ext}`)
  }

  // If output is a directory that doesn't exist, create it
  if (!isDir && fs.existsSync(outputPath) === false) {
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
  }

  console.log(colorize('📋 操作摘要:', 'bright'))
  console.log(`   输入: ${isDir ? '目录' : '单文件'}`)
  console.log(`   输出: ${outputPath}`)
  console.log(`   视频数量: ${filesToProcess.length} 个`)
  console.log(`   去重参数: mpdecimate=hi=768:lo=640:frac=0.1`)

  // Confirm if not --yes
  let confirmed = args.yes
  if (!confirmed) {
    const answer = await question(rl, colorize('\n⚠️  确认处理? (y/N): ', 'yellow'))
    confirmed = answer.toLowerCase() === 'y'
  }
  rl.close()

  if (!confirmed) {
    console.log(colorize('已取消', 'gray'))
    process.exit(0)
  }

  // Create output directory if processing directory
  if (isDir && !fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true })
  }

  // Process videos
  console.log(colorize('\n🎬 开始处理...\n', 'bright'))

  let successCount = 0
  let failCount = 0
  const failures: string[] = []

  for (let i = 0; i < filesToProcess.length; i++) {
    const inputFile = filesToProcess[i]
    const filename = path.basename(inputFile)

    let outputFile: string
    if (isDir) {
      outputFile = path.join(outputPath, filename)
    } else {
      outputFile = outputPath
    }

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} 处理 [${i + 1}/${filesToProcess.length}] ${filename} ... `
    )

    try {
      await dedupVideo(inputFile, outputFile)
      console.log(colorize('✅', 'green'))
      successCount++
    } catch (err) {
      console.log(colorize('❌', 'red'))
      failCount++
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${filename}: ${msg}`)
    }
  }

  // Summary
  console.log(colorize('\n' + '='.repeat(50), 'gray'))
  console.log(colorize('✅ 处理完成!', 'bright'))
  console.log(`   成功: ${colorize(successCount, 'green')} 个`)
  console.log(`   失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')} 个`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ 失败列表:', 'red'))
    failures.forEach(f => console.log(`   - ${f}`))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main()
