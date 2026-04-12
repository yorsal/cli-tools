#!/usr/bin/env tsx

/**
 * Video Batch Convert Tool
 *
 * Convert video files to different formats using ffmpeg
 * Usage: tsx video/video-convert.ts --input <directory> [options]
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
  format?: string
  mode?: 'overwrite' | 'new-dir'
  output?: string
  quality?: number
  codec?: string
  yes?: boolean
  help?: boolean
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' || arg === '-i') result.input = args[++i]
    else if (arg === '--format' || arg === '-f') result.format = args[++i]
    else if (arg === '--mode' || arg === '-m') result.mode = args[++i] as CliArgs['mode']
    else if (arg === '--output' || arg === '-o') result.output = args[++i]
    else if (arg === '--quality' || arg === '-q') result.quality = parseInt(args[++i], 10)
    else if (arg === '--codec' || arg === '-c') result.codec = args[++i]
    else if (arg === '--yes' || arg === '-y') result.yes = true
    else if (arg === '--help' || arg === '-H') result.help = true
  }
  return result
}

function showHelp(): void {
  console.log(`
🎬 Video Batch Convert Tool

Usage: tsx video/video-convert.ts --input <directory> [options]

Required:
  --input, -i <directory>    Source video directory

Options:
  --format, -f <format>     Output format: mp4, webm, avi, mkv, mov, gif
  --codec, -c <codec>        Video codec: h264, h265, vp9, av1 (default: h264 for mp4)
  --quality, -q <number>     Output quality 1-100 (default: 85)
  --mode, -m <mode>          Output mode: overwrite, new-dir
  --output, -o <directory>   Output directory (required when mode=new-dir)
  --yes, -y                  Skip all prompts, use defaults
  --help, -H                 Show this help message

Examples:
  tsx video/video-convert.ts -i public/videos/demo
  tsx video/video-convert.ts -i public/videos/demo --format mp4 --mode overwrite --yes
  tsx video/video-convert.ts -i public/videos/demo -f webm -m new-dir -o public/videos/converted
  tsx video/video-convert.ts -i public/videos/demo -f gif -q 90
`)
}

// Color output (same pattern as other scripts)
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

// Readline helper (same pattern as install.ts, setup-env.ts)
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

// Supported video formats and their ffmpeg mappings
const FORMAT_PRESETS: Record<string, { ext: string; codec: string; description: string }> = {
  mp4: { ext: 'mp4', codec: 'h264', description: 'MP4 (H.264)' },
  webm: { ext: 'webm', codec: 'vp9', description: 'WebM (VP9)' },
  avi: { ext: 'avi', codec: 'h264', description: 'AVI' },
  mkv: { ext: 'mkv', codec: 'h264', description: 'Matroska' },
  mov: { ext: 'mov', codec: 'h264', description: 'QuickTime MOV' },
  gif: { ext: 'gif', codec: 'gif', description: 'Animated GIF' },
}

function askFormat(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n🎬 输出格式:', 'bright'))
    console.log('   1) MP4 (H.264)')
    console.log('   2) WebM (VP9)')
    console.log('   3) AVI')
    console.log('   4) MKV (Matroska)')
    console.log('   5) MOV (QuickTime)')
    console.log('   6) GIF (Animated)')
    question(rl, '\n请选择 (1-6): ').then(answer => {
      const map: Record<string, string> = {
        '1': 'mp4',
        '2': 'webm',
        '3': 'avi',
        '4': 'mkv',
        '5': 'mov',
        '6': 'gif',
      }
      resolve(map[answer] || 'mp4')
    })
  })
}

function askMode(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 输出模式:', 'bright'))
    console.log('   1) 覆盖原文件')
    console.log('   2) 输出到新目录')
    question(rl, '\n请选择 (1-2): ').then(answer => {
      resolve(answer === '2' ? 'new-dir' : 'overwrite')
    })
  })
}

async function askQuality(rl: readline.Interface): Promise<number> {
  console.log(colorize('\n🎚️  视频质量 (CRF 值，越低质量越高):', 'bright'))
  console.log('   1) 高质量 (CRF 18)')
  console.log('   2) 中等质量 (CRF 23)')
  console.log('   3) 低文件大小 (CRF 28)')
  console.log('   4) 自定义')
  const answer = await question(rl, '\n请选择 (1-4): ')

  const map: Record<string, number> = { '1': 18, '2': 23, '3': 28 }
  if (map[answer]) return map[answer]

  if (answer === '4') {
    const q = await question(rl, '   请输入 CRF 值 (18-28): ')
    const val = parseInt(q, 10)
    return isNaN(val) ? 23 : Math.min(28, Math.max(18, val))
  }
  return 23
}

// Supported video extensions
const SUPPORTED_EXTENSIONS = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg', '.gif']

function getVideoFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.error(colorize(`❌ 目录不存在: ${dir}`, 'red'))
    process.exit(1)
  }

  const files = fs.readdirSync(dir)
  const videos = files.filter(file => {
    const ext = path.extname(file).toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(ext)
  })

  if (videos.length === 0) {
    console.error(colorize(`❌ 目录中没有找到支持的视频格式: ${dir}`, 'yellow'))
    console.log(colorize(`   支持的格式: ${SUPPORTED_EXTENSIONS.join(', ')}`, 'reset'))
    process.exit(1)
  }

  return videos.map(f => path.join(dir, f))
}

function ensureUniqueDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  const base = dir
  let counter = 1
  let newDir = `${base}-${counter}`

  while (fs.existsSync(newDir)) {
    counter++
    newDir = `${base}-${counter}`
  }

  fs.mkdirSync(newDir, { recursive: true })
  return newDir
}

async function checkFfmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version')
    return true
  } catch {
    return false
  }
}

// Quote path if it contains spaces (for shell safety)
function quotePath(path: string): string {
  if (path.includes(' ')) {
    return `"${path}"`
  }
  return path
}

function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  format: string,
  quality: number
): string[] {
  const args: string[] = ['-y'] // Overwrite output file

  // Input file (quote if contains spaces)
  args.push('-i', quotePath(inputPath))

  // Format-specific encoding
  switch (format) {
    case 'mp4':
      args.push(
        '-c:v', 'libx264',
        '-crf', quality.toString(),
        '-preset', 'medium',
        '-c:a', 'aac',
        '-b:a', '128k'
      )
      break
    case 'webm':
      args.push(
        '-c:v', 'libvpx-vp9',
        '-crf', quality.toString(),
        '-b:v', '0',
        '-c:a', 'libopus',
        '-b:a', '128k'
      )
      break
    case 'avi':
      args.push(
        '-c:v', 'libx264',
        '-crf', quality.toString(),
        '-c:a', 'mp3',
        '-b:a', '128k'
      )
      break
    case 'mkv':
      args.push(
        '-c:v', 'libx264',
        '-crf', quality.toString(),
        '-c:a', 'aac',
        '-b:a', '128k'
      )
      break
    case 'mov':
      args.push(
        '-c:v', 'libx264',
        '-crf', quality.toString(),
        '-c:a', 'aac',
        '-b:a', '128k'
      )
      break
    case 'gif':
      // GIF conversion - use palette for better quality
      // Second pass: convert to gif using palette
      args.push(
        '-i', '<palette>', // placeholder, will be replaced in convertVideo
        '-lavfi', `fps=15,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse`,
        '-loop', '0'
      )
      break
  }

  args.push(quotePath(outputPath))
  return args
}

async function convertVideo(
  inputPath: string,
  outputPath: string,
  format: string,
  quality: number
): Promise<void> {
  try {
    if (format === 'gif') {
      // GIF conversion: first generate palette, then convert
      const paletteFile = outputPath.replace('.gif', '_palette.png')

      // First pass: generate palette
      const paletteArgs = [
        '-y', '-i', quotePath(inputPath),
        '-vf', 'fps=15,scale=480:-1:flags=lanczos,palettegen',
        quotePath(paletteFile),
      ]
      await execAsync(`ffmpeg ${paletteArgs.join(' ')}`)

      // Second pass: convert to gif using palette
      const args = [
        '-y', '-i', quotePath(inputPath),
        '-i', quotePath(paletteFile),
        '-lavfi', 'fps=15,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse',
        '-loop', '0',
        quotePath(outputPath),
      ]
      await execAsync(`ffmpeg ${args.join(' ')}`)

      // Clean up palette file
      if (fs.existsSync(paletteFile)) {
        fs.unlinkSync(paletteFile)
      }
    } else {
      const args = buildFfmpegArgs(inputPath, outputPath, format, quality)
      const command = `ffmpeg ${args.join(' ')}`
      await execAsync(command)
    }
  } catch (err) {
    throw new Error(`ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}


async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate required arguments
  if (!args.input) {
    console.error(colorize('❌ 请指定输入目录: --input <directory>', 'red'))
    console.log('   使用 --help 查看帮助')
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

  const inputDir = path.resolve(args.input)
  const videoFiles = getVideoFiles(inputDir)

  console.log(colorize('\n🎬 视频批量转换工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 输入目录: ${inputDir}`, 'cyan'))
  console.log(colorize(`🖼️  发现 ${videoFiles.length} 个视频文件\n`, 'cyan'))

  const rl = createInterface()

  // Gather parameters interactively if not provided (use defaults when --yes is set)
  const format = args.format || (args.yes ? 'mp4' : await askFormat(rl))
  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'
  const quality = args.quality || (args.yes ? 23 : await askQuality(rl))

  let outputDir = inputDir
  if (mode === 'new-dir') {
    const targetDir = args.output || path.join(inputDir, 'converted')
    outputDir = ensureUniqueDir(targetDir)
  }

  // Show summary
  console.log(colorize('\n📋 操作摘要:', 'bright'))
  console.log(`   输入目录: ${inputDir}`)
  console.log(`   输出模式: ${mode === 'overwrite' ? '覆盖原文件' : `新目录 (${outputDir})`}`)
  console.log(`   输出格式: ${format.toUpperCase()}`)
  console.log(`   CRF 质量: ${quality} (${quality <= 20 ? '高质量' : quality <= 25 ? '中等质量' : '低文件大小'})`)
  console.log(`   视频数量: ${videoFiles.length} 个`)

  // Confirm if not --yes
  let confirmed = args.yes
  if (!confirmed) {
    const answer = await question(rl, colorize('\n⚠️  此操作不可撤销，确认执行? (y/N): ', 'yellow'))
    confirmed = answer.toLowerCase() === 'y'
  }
  rl.close()

  if (!confirmed) {
    console.log(colorize('已取消', 'gray'))
    process.exit(0)
  }

  // Process videos
  console.log(colorize('\n🎬 开始处理...\n', 'bright'))

  let successCount = 0
  let failCount = 0
  const failures: string[] = []

  for (let i = 0; i < videoFiles.length; i++) {
    const inputPath = videoFiles[i]
    const filename = path.basename(inputPath)
    const formatInfo = FORMAT_PRESETS[format]
    const outputExt = formatInfo?.ext || format
    const outputFilename = filename.replace(/\.[^.]+$/, `.${outputExt}`)
    const outputPath = mode === 'overwrite' ? inputPath : path.join(outputDir, outputFilename)

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} 处理 [${i + 1}/${videoFiles.length}] ${filename} ... `
    )

    try {
      await convertVideo(inputPath, outputPath, format, quality)
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
