#!/usr/bin/env tsx

/**
 * Image Batch Crop Tool
 *
 * Crop images in a directory to a specified aspect ratio
 * Usage: tsx scripts/crop-images.ts --input <directory> [options]
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import * as readline from 'readline'

// CLI argument types
interface CliArgs {
  input?: string
  ratio?: string
  format?: 'jpg' | 'png' | 'webp' | 'keep'
  mode?: 'overwrite' | 'new-dir'
  output?: string
  quality?: number
  maxWidth?: number
  maxHeight?: number
  yes?: boolean
  help?: boolean
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' || arg === '-i') result.input = args[++i]
    else if (arg === '--ratio' || arg === '-r') result.ratio = args[++i]
    else if (arg === '--format' || arg === '-f') result.format = args[++i] as CliArgs['format']
    else if (arg === '--mode' || arg === '-m') result.mode = args[++i] as CliArgs['mode']
    else if (arg === '--output' || arg === '-o') result.output = args[++i]
    else if (arg === '--quality' || arg === '-q') result.quality = parseInt(args[++i], 10)
    else if (arg === '--max-width' || arg === '-w') result.maxWidth = parseInt(args[++i], 10)
    else if (arg === '--max-height' || arg === '-h') result.maxHeight = parseInt(args[++i], 10)
    else if (arg === '--yes' || arg === '-y') result.yes = true
    else if (arg === '--help' || arg === '-H') result.help = true
  }
  return result
}

function showHelp(): void {
  console.log(`
📷 Image Batch Crop Tool

Usage: tsx scripts/crop-images.ts --input <directory> [options]

Required:
  --input, -i <directory>    Source image directory

Options:
  --ratio, -r <ratio>       Crop ratio (e.g. 16:9, 4:3, 1:1)
  --format, -f <format>     Output format: jpg, png, webp, keep (default: keep)
  --mode, -m <mode>         Output mode: overwrite, new-dir
  --output, -o <directory>  Output directory (required when mode=new-dir)
  --quality, -q <number>    Output quality 1-100 (default: 85)
  --max-width, -w <pixels>  Maximum crop width (e.g. 1920)
  --max-height, -H <pixels> Maximum crop height (e.g. 1080)
  --yes, -y                  Skip all prompts, use defaults
  --help, -H                 Show this help message

Examples:
  tsx scripts/crop-images.ts -i public/images/demo
  tsx scripts/crop-images.ts -i public/images/demo --ratio 16:9 --mode overwrite --yes
  tsx scripts/crop-images.ts -i public/images/demo -r 4:3 -m new-dir -o public/images/cropped
  tsx scripts/crop-images.ts -i public/images/demo -r 16:9 -w 1920 -H 1080
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

// Supported crop ratios
const RATIO_PRESETS: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
  '1:1': [1, 1],
}

function parseRatio(input: string): [number, number] | null {
  // Check presets first
  if (RATIO_PRESETS[input]) return RATIO_PRESETS[input]
  // Parse W:H format
  const match = input.match(/^(\d+):(\d+)$/)
  if (match) {
    const w = parseInt(match[1], 10)
    const h = parseInt(match[2], 10)
    if (w > 0 && h > 0) return [w, h]
  }
  return null
}

function askRatio(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 裁剪比例:', 'bright'))
    console.log('   1) 16:9')
    console.log('   2) 4:3')
    console.log('   3) 1:1')
    console.log('   4) 自定义 (输入 W:H)')
    question(rl, '\n请选择 (1-4): ').then(answer => {
      switch (answer) {
        case '1': resolve('16:9'); break
        case '2': resolve('4:3'); break
        case '3': resolve('1:1'); break
        case '4':
          question(rl, '请输入比例 (如 3:2): ').then(r => resolve(r))
          break
        default: resolve('16:9')
      }
    })
  })
}

function askMode(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 输出模式:', 'bright'))
    console.log('   1) 覆盖原图')
    console.log('   2) 输出到新目录')
    question(rl, '\n请选择 (1-2): ').then(answer => {
      resolve(answer === '2' ? 'new-dir' : 'overwrite')
    })
  })
}

async function askFormat(rl: readline.Interface): Promise<string> {
  console.log(colorize('\n❓ 输出格式:', 'bright'))
  console.log('   1) 保持原格式')
  console.log('   2) 转为 jpg')
  console.log('   3) 转为 png')
  console.log('   4) 转为 webp')
  const answer = await question(rl, '\n请选择 (1-4): ')
  const map: Record<string, string> = { '1': 'keep', '2': 'jpg', '3': 'png', '4': 'webp' }
  return map[answer] || 'keep'
}

async function askMaxSize(rl: readline.Interface): Promise<{ maxWidth?: number; maxHeight?: number }> {
  console.log(colorize('\n❓ 最大尺寸限制 (可选):', 'bright'))
  console.log('   1) 不限制')
  console.log('   2) 限制宽度')
  console.log('   3) 限制高度')
  console.log('   4) 限制宽度和高度')
  const answer = await question(rl, '\n请选择 (1-4): ')

  if (answer === '1') return {}
  if (answer === '2') {
    const w = await question(rl, '   请输入最大宽度 (像素): ')
    return { maxWidth: parseInt(w, 10) }
  }
  if (answer === '3') {
    const h = await question(rl, '   请输入最大高度 (像素): ')
    return { maxHeight: parseInt(h, 10) }
  }
  if (answer === '4') {
    const w = await question(rl, '   请输入最大宽度 (像素): ')
    const h = await question(rl, '   请输入最大高度 (像素): ')
    return { maxWidth: parseInt(w, 10), maxHeight: parseInt(h, 10) }
  }
  return {}
}

// Supported image extensions
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff']

function getImageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.error(colorize(`❌ 目录不存在: ${dir}`, 'red'))
    process.exit(1)
  }

  const files = fs.readdirSync(dir)
  const images = files.filter(file => {
    const ext = path.extname(file).toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(ext)
  })

  if (images.length === 0) {
    console.error(colorize(`❌ 目录中没有找到支持的图片格式: ${dir}`, 'yellow'))
    console.log(colorize(`   支持的格式: ${SUPPORTED_EXTENSIONS.join(', ')}`, 'reset'))
    process.exit(1)
  }

  return images.map(f => path.join(dir, f))
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

async function centerCrop(
  inputPath: string,
  outputPath: string,
  targetRatio: [number, number],
  format: 'jpg' | 'png' | 'webp' | 'keep',
  quality: number,
  maxWidth?: number,
  maxHeight?: number
): Promise<void> {
  const image = sharp(inputPath)
  const metadata = await image.metadata()

  if (!metadata.width || !metadata.height) {
    throw new Error(`无法读取图片尺寸: ${inputPath}`)
  }

  const [targetW, targetH] = targetRatio
  const targetRatioValue = targetW / targetH
  const currentRatioValue = metadata.width / metadata.height

  // Resize if image exceeds max dimensions while maintaining aspect ratio
  let resizeWidth = metadata.width
  let resizeHeight = metadata.height

  if (maxWidth && maxHeight) {
    const maxRatio = maxWidth / maxHeight

    // If image is larger than max dimensions in either direction
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      if (currentRatioValue > maxRatio) {
        // Image is wider than max - constrain by width
        resizeWidth = maxWidth
        resizeHeight = Math.round(maxWidth / currentRatioValue)
      } else {
        // Image is taller than max - constrain by height
        resizeHeight = maxHeight
        resizeWidth = Math.round(maxHeight * currentRatioValue)
      }
    }
  } else if (maxWidth && metadata.width > maxWidth) {
    resizeWidth = maxWidth
    resizeHeight = Math.round(maxWidth / currentRatioValue)
  } else if (maxHeight && metadata.height > maxHeight) {
    resizeHeight = maxHeight
    resizeWidth = Math.round(maxHeight * currentRatioValue)
  }

  // Calculate crop dimensions based on resized image
  let cropWidth: number
  let cropHeight: number

  if (currentRatioValue > targetRatioValue) {
    // Image is wider than target - crop width
    cropHeight = resizeHeight
    cropWidth = Math.round(resizeHeight * targetRatioValue)
  } else {
    // Image is taller than target - crop height
    cropWidth = resizeWidth
    cropHeight = Math.round(resizeWidth / targetRatioValue)
  }

  // Calculate center position
  const left = Math.round((resizeWidth - cropWidth) / 2)
  const top = Math.round((resizeHeight - cropHeight) / 2)

  let pipeline = sharp(inputPath)

  // Resize first if needed
  if (resizeWidth !== metadata.width || resizeHeight !== metadata.height) {
    pipeline = pipeline.resize(resizeWidth, resizeHeight, { fit: 'fill' })
  }

  pipeline = pipeline
    .extract({ left, top, width: cropWidth, height: cropHeight })

  // Determine output format
  const originalExt = path.extname(inputPath).toLowerCase()

  if (format !== 'keep') {
    const formatMap: Record<string, 'jpeg' | 'png' | 'webp'> = {
      jpg: 'jpeg',
      png: 'png',
      webp: 'webp',
    }
    pipeline = pipeline.toFormat(formatMap[format], { quality })
  } else {
    if (originalExt === '.jpg' || originalExt === '.jpeg') {
      pipeline = pipeline.jpeg({ quality })
    } else if (originalExt === '.png') {
      pipeline = pipeline.png()
    } else if (originalExt === '.webp') {
      pipeline = pipeline.webp({ quality })
    }
  }

  await pipeline.toFile(outputPath)
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

  const inputDir = path.resolve(args.input)
  const imageFiles = getImageFiles(inputDir)

  console.log(colorize('\n📷 图片批量裁剪工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 输入目录: ${inputDir}`, 'cyan'))
  console.log(colorize(`🖼️  发现 ${imageFiles.length} 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Gather parameters interactively if not provided (use defaults when --yes is set)
  const ratioStr = args.ratio || (args.yes ? '16:9' : await askRatio(rl))
  const ratio = parseRatio(ratioStr)
  if (!ratio) {
    console.error(colorize(`❌ 无效的裁剪比例: ${ratioStr}`, 'red'))
    rl.close()
    process.exit(1)
  }

  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'

  let outputDir = inputDir
  if (mode === 'new-dir') {
    const targetDir = args.output || path.join(inputDir, 'cropped')
    outputDir = ensureUniqueDir(targetDir)
  }

  const format = (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const quality = args.quality || 85
  const maxSize = args.maxWidth || args.maxHeight
    ? { maxWidth: args.maxWidth, maxHeight: args.maxHeight }
    : args.yes
      ? {}
      : await askMaxSize(rl)
  const maxWidth = maxSize.maxWidth
  const maxHeight = maxSize.maxHeight

  // Show summary
  console.log(colorize('\n📋 操作摘要:', 'bright'))
  console.log(`   输入目录: ${inputDir}`)
  console.log(`   输出模式: ${mode === 'overwrite' ? '覆盖原图' : `新目录 (${outputDir})`}`)
  console.log(`   裁剪比例: ${ratioStr}`)
  if (maxWidth || maxHeight) {
    console.log(`   最大尺寸: ${maxWidth || '无'} x ${maxHeight || '无'}`)
  }
  console.log(`   输出格式: ${format === 'keep' ? '保持原格式' : format}`)
  console.log(`   图片数量: ${imageFiles.length} 张`)

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

  // Process images
  console.log(colorize('\n🖼️  开始处理...\n', 'bright'))

  let successCount = 0
  let failCount = 0
  const failures: string[] = []

  for (let i = 0; i < imageFiles.length; i++) {
    const inputPath = imageFiles[i]
    const filename = path.basename(inputPath)
    const outputExt = format === 'keep' ? path.extname(filename) : `.${format}`
    const outputFilename = filename.replace(/\.[^.]+$/, '') + outputExt
    const outputPath = mode === 'overwrite' ? inputPath : path.join(outputDir, outputFilename)

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} 处理 [${i + 1}/${imageFiles.length}] ${filename} ... `
    )

    try {
      await centerCrop(inputPath, outputPath, ratio, format, quality, maxWidth, maxHeight)
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
  console.log(`   成功: ${colorize(successCount, 'green')} 张`)
  console.log(`   失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')} 张`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ 失败列表:', 'red'))
    failures.forEach(f => console.log(`   - ${f}`))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main()
