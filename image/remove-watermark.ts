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
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

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

Usage: tsx image/remove-watermark.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

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

function askRegion(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Target region 目标区域:', 'bright'))
    console.log(colorize('   1) Whole image 整张图片', 'gray'))
    console.log(colorize('   2) Top area 顶部区域', 'gray'))
    console.log(colorize('   3) Bottom area 底部区域', 'gray'))
    console.log(colorize('   4) Left area 左侧区域', 'gray'))
    console.log(colorize('   5) Right area 右侧区域', 'gray'))
    console.log(colorize('   6) Corner areas 四角区域', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-6): ', 'bright')).then(answer => {
      const map: Record<string, string> = {
        '1': 'all', '2': 'top', '3': 'bottom',
        '4': 'left', '5': 'right', '6': 'corner',
      }
      resolve(map[answer] || 'all')
    })
  })
}

function askStrength(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Removal strength 去除强度:', 'bright'))
    console.log(colorize('   1) Light 轻度 (preserve more detail 保留更多原图细节)', 'gray'))
    console.log(colorize('   2) Medium 中度 (balance 平衡)', 'gray'))
    console.log(colorize('   3) Strong 强度 (cleaner but may affect quality 更干净但可能影响画质)', 'gray'))
    console.log(colorize('   4) Custom 自定义', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright')).then(answer => {
      const map: Record<string, number> = { '1': 0.4, '2': 0.7, '3': 0.9 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '4') {
        question(rl, colorize('Enter strength 强度 (0-1, e.g. 如 0.6): ', 'bright')).then(v => {
          resolve(Math.min(1, Math.max(0, parseFloat(v) || 0.7)))
        })
      } else resolve(0.7)
    })
  })
}

function askThreshold(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Detection sensitivity 检测灵敏度:', 'bright'))
    console.log(colorize('   1) Low 低 (only obvious watermarks 只检测明显水印)', 'gray'))
    console.log(colorize('   2) Medium 中 (default 默认)', 'gray'))
    console.log(colorize('   3) High 高 (detect more areas 检测更多区域)', 'gray'))
    console.log(colorize('   4) Custom 自定义', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright')).then(answer => {
      const map: Record<string, number> = { '1': 0.2, '2': 0.1, '3': 0.05 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '4') {
        question(rl, colorize('Enter sensitivity 灵敏度 (0-1, e.g. 如 0.1): ', 'bright')).then(v => {
          resolve(Math.min(1, Math.max(0, parseFloat(v) || 0.1)))
        })
      } else resolve(0.1)
    })
  })
}

function askFormat(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Output format 输出格式:', 'bright'))
    console.log(colorize('   1) Keep original format 保持原格式', 'gray'))
    console.log(colorize('   2) Convert to jpg 转为 jpg', 'gray'))
    console.log(colorize('   3) Convert to png 转为 png', 'gray'))
    console.log(colorize('   4) Convert to webp 转为 webp', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright')).then(answer => {
      const map: Record<string, string> = { '1': 'keep', '2': 'jpg', '3': 'png', '4': 'webp' }
      resolve(map[answer] || 'keep')
    })
  })
}

function askMode(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Output mode 输出模式:', 'bright'))
    console.log(colorize('   1) Overwrite original 覆盖原图', 'gray'))
    console.log(colorize('   2) Output to new directory 输出到新目录', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-2): ', 'bright')).then(answer => {
      resolve(answer === '2' ? 'new-dir' : 'overwrite')
    })
  })
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
    throw new Error(`Cannot read image size 无法读取图片尺寸: ${inputPath}`)
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
    console.error(colorize('❌ Please specify input 请指定输入目录: --input <directory>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  const inputPath = path.resolve(args.input)
  const imageFiles = getImageFiles(inputPath)

  const isSingleFile = fs.statSync(inputPath).isFile()

  console.log(colorize('\n🖼️  Image Watermark Removal Tool 图片去水印工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Gather parameters
  const regionStr = args.region || (args.yes ? 'all' : await askRegion(rl))
  const region = parseRegion(regionStr) || {}
  const threshold = args.threshold ?? (args.yes ? 0.1 : await askThreshold(rl))
  const strength = args.strength ?? (args.yes ? 0.7 : await askStrength(rl))
  const format = (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'
  const quality = args.quality || 85

  let outputDir = inputPath
  if (mode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'cleaned')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'cleaned')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${mode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)
  console.log(`   Target region 目标区域: ${regionStr}`)
  console.log(`   Detection sensitivity 检测灵敏度: ${threshold}`)
  console.log(`   Removal strength 去除强度: ${Math.round(strength * 100)}%`)
  console.log(`   Output format 输出格式: ${format === 'keep' ? 'Keep original 保持原格式' : format}`)
  console.log(`   Images 图片数量: ${imageFiles.length} 张`)

  // Confirm if not --yes
  let confirmed = args.yes
  if (!confirmed) {
    const answer = await question(rl, colorize('\n⚠️  This cannot be undone. Confirm? 此操作不可撤销，确认执行? (y/N): ', 'yellow'))
    confirmed = answer.toLowerCase() === 'y'
  }
  rl.close()

  if (!confirmed) {
    console.log(colorize('Cancelled 已取消', 'gray'))
    process.exit(0)
  }

  // Process images
  console.log(colorize('\n🖼️  Processing 处理中...\n', 'bright'))

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
      `   ${colorize('▶', 'cyan')} Processing 处理 [${i + 1}/${imageFiles.length}] ${filename} ... `
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
  console.log(colorize('✅ Done 完成!', 'bright'))
  console.log(`   Success 成功: ${colorize(successCount, 'green')} 张`)
  console.log(`   Failed 失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')} 张`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ Failed files 失败列表:', 'red'))
    failures.forEach(f => console.log(`   - ${f}`))
  }

  console.log(colorize('\n💡 Tip 提示: Watermark removal 效果因图片而异，对于复杂水印可能需要使用专业工具效果因图片而异，对于复杂水印可能需要使用专业工具', 'gray'))

  process.exit(failCount > 0 ? 1 : 0)
}

main()
