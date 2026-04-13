#!/usr/bin/env tsx

/**
 * Image Watermark Removal Tool
 *
 * Remove or reduce watermark visibility from images
 * Usage: tsx image/remove-watermark.ts --input <directory> [options]
 *
 * Note: This tool uses detection-based removal which works best for
 * semi-transparent watermarks. Results vary depending on watermark type.
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import * as readline from 'readline'

// CLI argument types
interface CliArgs {
  input?: string
  region?: string
  threshold?: number
  strength?: number
  format?: 'jpg' | 'png' | 'webp' | 'keep'
  mode?: 'overwrite' | 'new-dir'
  output?: string
  quality?: number
  yes?: boolean
  help?: boolean
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' || arg === '-i') result.input = args[++i]
    else if (arg === '--region' || arg === '-r') result.region = args[++i]
    else if (arg === '--threshold' || arg === '-t') result.threshold = parseFloat(args[++i])
    else if (arg === '--strength' || arg === '-s') result.strength = parseFloat(args[++i])
    else if (arg === '--format' || arg === '-f') result.format = args[++i] as CliArgs['format']
    else if (arg === '--mode' || arg === '-m') result.mode = args[++i] as CliArgs['mode']
    else if (arg === '--output' || arg === '-o') result.output = args[++i]
    else if (arg === '--quality' || arg === '-q') result.quality = parseInt(args[++i], 10)
    else if (arg === '--yes' || arg === '-y') result.yes = true
    else if (arg === '--help' || arg === '-H') result.help = true
  }
  return result
}

function showHelp(): void {
  console.log(`
🖼️  Image Watermark Removal Tool

Usage: tsx image/remove-watermark.ts --input <directory> [options]

Required:
  --input, -i <directory>    Source image directory

Options:
  --region, -r <region>      Target region: all, top, bottom, left, right, corner
                              (default: all)
  --threshold, -t <0-1>      Alpha threshold for watermark detection (default: 0.1)
                              Lower = detect more areas, Higher = detect less
  --strength, -s <0-1>       Removal strength (default: 0.7)
                              Higher = stronger removal but may affect image quality

Options (Output):
  --format, -f <format>       Output format: jpg, png, webp, keep (default: keep)
  --mode, -m <mode>          Output mode: overwrite, new-dir
  --output, -o <directory>    Output directory (required when mode=new-dir)
  --quality, -q <number>      Output quality 1-100 (default: 85)
  --yes, -y                   Skip all prompts, use defaults
  --help, -H                  Show this help message

Examples:
  tsx image/remove-watermark.ts -i public/images/demo
  tsx image/remove-watermark.ts -i public/images/demo --region bottom --strength 0.8
  tsx image/remove-watermark.ts -i public/images/demo -r corner -t 0.15 -m new-dir -o public/images/cleaned
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

// Region presets
const REGION_PRESETS: Record<string, { top?: number; bottom?: number; left?: number; right?: number }> = {
  'all': {},
  'top': { top: 0.15 },
  'bottom': { bottom: 0.15 },
  'left': { left: 0.15 },
  'right': { right: 0.15 },
  'corner': { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
}

function parseRegion(input: string): { top?: number; bottom?: number; left?: number; right?: number } | null {
  const key = input.toLowerCase()
  if (REGION_PRESETS[key]) return REGION_PRESETS[key]
  return null
}

function askRegion(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 目标区域:', 'bright'))
    console.log('   1) 整张图片')
    console.log('   2) 顶部区域')
    console.log('   3) 底部区域')
    console.log('   4) 左侧区域')
    console.log('   5) 右侧区域')
    console.log('   6) 四角区域')
    question(rl, '\n请选择 (1-6): ').then(answer => {
      const map: Record<string, string> = {
        '1': 'all', '2': 'top', '3': 'bottom',
        '4': 'left', '5': 'right', '6': 'corner',
      }
      resolve(map[answer] || 'all')
    })
  })
}

function askStrength(rl: readline.Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 去除强度:', 'bright'))
    console.log('   1) 轻度 (保留更多原图细节)')
    console.log('   2) 中度 (平衡)')
    console.log('   3) 强度 (更干净但可能影响画质)')
    console.log('   4) 自定义')
    question(rl, '\n请选择 (1-4): ').then(answer => {
      const map: Record<string, number> = { '1': 0.4, '2': 0.7, '3': 0.9 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '4') {
        question(rl, '请输入强度 (0-1, 如 0.6): ').then(v => {
          resolve(Math.min(1, Math.max(0, parseFloat(v) || 0.7)))
        })
      } else resolve(0.7)
    })
  })
}

function askThreshold(rl: readline.Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 检测灵敏度:', 'bright'))
    console.log('   1) 低 (只检测明显水印)')
    console.log('   2) 中 (默认)')
    console.log('   3) 高 (检测更多区域)')
    console.log('   4) 自定义')
    question(rl, '\n请选择 (1-4): ').then(answer => {
      const map: Record<string, number> = { '1': 0.2, '2': 0.1, '3': 0.05 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '4') {
        question(rl, '请输入灵敏度 (0-1, 如 0.1): ').then(v => {
          resolve(Math.min(1, Math.max(0, parseFloat(v) || 0.1)))
        })
      } else resolve(0.1)
    })
  })
}

function askFormat(rl: readline.Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ 输出格式:', 'bright'))
    console.log('   1) 保持原格式')
    console.log('   2) 转为 jpg')
    console.log('   3) 转为 png')
    console.log('   4) 转为 webp')
    question(rl, '\n请选择 (1-4): ').then(answer => {
      const map: Record<string, string> = { '1': 'keep', '2': 'jpg', '3': 'png', '4': 'webp' }
      resolve(map[answer] || 'keep')
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

// Detect watermark region bounds
function getRegionBounds(
  width: number,
  height: number,
  region: { top?: number; bottom?: number; left?: number; right?: number }
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: region.left ? Math.floor(width * region.left) : 0,
    top: region.top ? Math.floor(height * region.top) : 0,
    right: region.right ? Math.floor(width * (1 - region.right)) : width,
    bottom: region.bottom ? Math.floor(height * (1 - region.bottom)) : height,
  }
}

async function removeWatermark(
  inputPath: string,
  outputPath: string,
  options: {
    region: { top?: number; bottom?: number; left?: number; right?: number }
    threshold: number
    strength: number
    format: 'jpg' | 'png' | 'webp' | 'keep'
    quality: number
  }
): Promise<void> {
  const image = sharp(inputPath)
  const metadata = await image.metadata()

  if (!metadata.width || !metadata.height) {
    throw new Error(`无法读取图片尺寸: ${inputPath}`)
  }

  const { width, height } = metadata
  const regionBounds = getRegionBounds(width, height, options.region)

  // Convert to RGBA buffer for processing
  const inputBuffer = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true }) as { data: Buffer; info: { width: number; height: number; channels: number } }

  // Create output buffer
  const outputBuffer = Buffer.alloc(inputBuffer.data.length)

  // Copy all data initially
  inputBuffer.data.copy(outputBuffer)

  // Process each pixel in the region
  const { left, top, right, bottom } = regionBounds
  const channels = 4 // RGBA

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const idx = (y * width + x) * channels
      const alpha = inputBuffer.data[idx + 3]

      // Detect semi-transparent pixels (potential watermark)
      // Watermarks often have consistent alpha values in a certain range
      if (alpha > 0 && alpha < 255) {
        // Check if this might be part of a watermark pattern
        // by looking at surrounding pixels
        let sameColorCount = 0

        // Sample surrounding pixels
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue

            const nx = Math.min(width - 1, Math.max(0, x + dx))
            const ny = Math.min(height - 1, Math.max(0, y + dy))
            const nidx = (ny * width + nx) * channels

            // Count pixels with similar RGB but different alpha
            const rDiff = Math.abs(inputBuffer.data[idx] - inputBuffer.data[nidx])
            const gDiff = Math.abs(inputBuffer.data[idx + 1] - inputBuffer.data[nidx + 1])
            const bDiff = Math.abs(inputBuffer.data[idx + 2] - inputBuffer.data[nidx + 2])

            const colorSimilar = rDiff < 30 && gDiff < 30 && bDiff < 30
            const alphaDiff = Math.abs(alpha - inputBuffer.data[nidx + 3]) > 50

            if (colorSimilar && alphaDiff) {
              sameColorCount++
            }
          }
        }

        // If surrounded by similar-color pixels with different alpha, likely watermark
        if (sameColorCount >= 3) {
          // Find the most common non-watermark pixel color nearby and blend
          const samples: number[][] = []

          for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
              if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) continue // Skip inner area

              const nx = Math.min(width - 1, Math.max(0, x + dx))
              const ny = Math.min(height - 1, Math.max(0, y + dy))
              const nidx = (ny * width + nx) * channels

              // Only sample fully opaque pixels
              if (inputBuffer.data[nidx + 3] > 200) {
                samples.push([
                  inputBuffer.data[nidx],
                  inputBuffer.data[nidx + 1],
                  inputBuffer.data[nidx + 2],
                ])
              }
            }
          }

          if (samples.length > 0) {
            // Calculate median of samples
            const medianR = samples.map(s => s[0]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]
            const medianG = samples.map(s => s[1]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]
            const medianB = samples.map(s => s[2]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]

            // Blend original with median based on strength
            const blendFactor = options.strength * (alpha / 255)

            outputBuffer[idx] = Math.round(
              inputBuffer.data[idx] * (1 - blendFactor) + medianR * blendFactor
            )
            outputBuffer[idx + 1] = Math.round(
              inputBuffer.data[idx + 1] * (1 - blendFactor) + medianG * blendFactor
            )
            outputBuffer[idx + 2] = Math.round(
              inputBuffer.data[idx + 2] * (1 - blendFactor) + medianB * blendFactor
            )

            // Reduce alpha for watermark effect
            outputBuffer[idx + 3] = Math.round(alpha * (1 - options.strength * 0.8))
          }
        }
      }
    }
  }

  // Create output pipeline
  let pipeline = sharp(outputBuffer, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })

  // Apply blur to smooth the processed area
  pipeline = pipeline.blur(0.5)

  // Determine output format
  const originalExt = path.extname(inputPath).toLowerCase()

  if (options.format !== 'keep') {
    const formatMap: Record<string, 'jpeg' | 'png' | 'webp'> = {
      jpg: 'jpeg',
      png: 'png',
      webp: 'webp',
    }
    pipeline = pipeline.toFormat(formatMap[options.format], { quality: options.quality })
  } else {
    if (originalExt === '.jpg' || originalExt === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: options.quality })
    } else if (originalExt === '.png') {
      pipeline = pipeline.png()
    } else if (originalExt === '.webp') {
      pipeline = pipeline.webp({ quality: options.quality })
    }
  }

  // Process to buffer first, then write to file (avoids same-file conflict)
  const finalOutput = await pipeline.toBuffer()
  fs.writeFileSync(outputPath, finalOutput)
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

  console.log(colorize('\n🖼️  图片去水印工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 输入目录: ${inputDir}`, 'cyan'))
  console.log(colorize(`🖼️  发现 ${imageFiles.length} 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Gather parameters
  const regionStr = args.region || (args.yes ? 'all' : await askRegion(rl))
  const region = parseRegion(regionStr) || {}
  const threshold = args.threshold ?? (args.yes ? 0.1 : await askThreshold(rl))
  const strength = args.strength ?? (args.yes ? 0.7 : await askStrength(rl))
  const format = (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'
  const quality = args.quality || 85

  let outputDir = inputDir
  if (mode === 'new-dir') {
    const targetDir = args.output || path.join(inputDir, 'cleaned')
    outputDir = ensureUniqueDir(targetDir)
  }

  // Show summary
  console.log(colorize('\n📋 操作摘要:', 'bright'))
  console.log(`   输入目录: ${inputDir}`)
  console.log(`   输出模式: ${mode === 'overwrite' ? '覆盖原图' : `新目录 (${outputDir})`}`)
  console.log(`   目标区域: ${regionStr}`)
  console.log(`   检测灵敏度: ${threshold}`)
  console.log(`   去除强度: ${Math.round(strength * 100)}%`)
  console.log(`   输出格式: ${format === 'keep' ? '保持原格式' : format}`)
  console.log(`   图片数量: ${imageFiles.length} 张`)

  // Confirm if not --yes
  let confirmed = args.yes
  if (!confirmed) {
    const answer = await question(rl, colorize('\n⚠️  此操作不可撤销，建议先备份原图，确认执行? (y/N): ', 'yellow'))
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
      await removeWatermark(inputPath, outputPath, {
        region,
        threshold,
        strength,
        format,
        quality,
      })
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

  console.log(colorize('\n💡 提示: 去水印效果因图片而异，对于复杂水印可能需要使用专业工具', 'gray'))

  process.exit(failCount > 0 ? 1 : 0)
}

main()
