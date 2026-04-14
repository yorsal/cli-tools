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
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

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

Usage: tsx scripts/crop-images.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

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

// Supported crop ratios
const RATIO_PRESETS: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
  '3:4': [3, 4],
  '9:16': [9, 16],
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

function askRatio(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Crop ratio 裁剪比例:', 'bright'))
    console.log(colorize('   1) 16:9', 'gray'))
    console.log(colorize('   2) 4:3', 'gray'))
    console.log(colorize('   3) 3:4', 'gray'))
    console.log(colorize('   4) 9:16', 'gray'))
    console.log(colorize('   5) 1:1', 'gray'))
    console.log(colorize('   6) Custom 自定义 (input W:H 输入 W:H)', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-6): ', 'bright')).then(answer => {
      switch (answer) {
        case '1': resolve('16:9'); break
        case '2': resolve('4:3'); break
        case '3': resolve('3:4'); break
        case '4': resolve('9:16'); break
        case '5': resolve('1:1'); break
        case '6':
          question(rl, colorize('Enter ratio 输入比例 (e.g. 如 3:2): ', 'bright')).then(r => resolve(r))
          break
        default: resolve('16:9')
      }
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

async function askFormat(rl: Interface): Promise<string> {
  console.log(colorize('\n❓ Output format 输出格式:', 'bright'))
  console.log(colorize('   1) Keep original format 保持原格式', 'gray'))
  console.log(colorize('   2) Convert to jpg 转为 jpg', 'gray'))
  console.log(colorize('   3) Convert to png 转为 png', 'gray'))
  console.log(colorize('   4) Convert to webp 转为 webp', 'gray'))
  const answer = await question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright'))
  const map: Record<string, string> = { '1': 'keep', '2': 'jpg', '3': 'png', '4': 'webp' }
  return map[answer] || 'keep'
}

async function askMaxSize(rl: Interface): Promise<{ maxWidth?: number; maxHeight?: number }> {
  console.log(colorize('\n❓ Max size limit 最大尺寸限制 (optional 可选):', 'bright'))
  console.log(colorize('   1) No limit 不限制', 'gray'))
  console.log(colorize('   2) Limit width 限制宽度', 'gray'))
  console.log(colorize('   3) Limit height 限制高度', 'gray'))
  console.log(colorize('   4) Limit width and height 限制宽度和高度', 'gray'))
  const answer = await question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright'))

  if (answer === '1') return {}
  if (answer === '2') {
    const w = await question(rl, colorize('   Enter max width pixels 输入最大宽度 (像素): ', 'bright'))
    return { maxWidth: parseInt(w, 10) }
  }
  if (answer === '3') {
    const h = await question(rl, colorize('   Enter max height pixels 输入最大高度 (像素): ', 'bright'))
    return { maxHeight: parseInt(h, 10) }
  }
  if (answer === '4') {
    const w = await question(rl, colorize('   Enter max width pixels 输入最大宽度 (像素): ', 'bright'))
    const h = await question(rl, colorize('   Enter max height pixels 输入最大高度 (像素): ', 'bright'))
    return { maxWidth: parseInt(w, 10), maxHeight: parseInt(h, 10) }
  }
  return {}
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
  // When input and output are the same file, write to a temp file first then rename
  // to avoid "Cannot use same file for input and output" error
  const useTempFile = inputPath === outputPath
  const tempPath = useTempFile ? `${inputPath}.tmp.${Date.now()}` : null

  try {
    const image = sharp(inputPath)
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error(`Cannot read image size 无法读取图片尺寸: ${inputPath}`)
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

    const finalOutputPath = tempPath || outputPath
    await pipeline.toFile(finalOutputPath)

    // If using temp file, rename to final path (atomic on most systems)
    if (useTempFile && tempPath) {
      fs.renameSync(tempPath, outputPath)
    }
  } catch (err) {
    // Clean up temp file on error
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
    throw err
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
    console.error(colorize('❌ Please specify input 请指定输入目录: --input <directory>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  const inputPath = path.resolve(args.input)
  const imageFiles = getImageFiles(inputPath)

  const isSingleFile = fs.statSync(inputPath).isFile()

  console.log(colorize('\n📷 Image Batch Crop Tool 图片批量裁剪工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Gather parameters interactively if not provided (use defaults when --yes is set)
  const ratioStr = args.ratio || (args.yes ? '16:9' : await askRatio(rl))
  const ratio = parseRatio(ratioStr)
  if (!ratio) {
    console.error(colorize(`❌ Invalid ratio 无效的裁剪比例: ${ratioStr}`, 'red'))
    rl.close()
    process.exit(1)
  }

  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'

  let outputDir = inputPath
  if (mode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'cropped')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'cropped')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  const format = (mode === 'overwrite' || args.format === 'keep')
    ? 'keep'
    : (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const quality = args.quality || 85
  const maxSize = args.maxWidth || args.maxHeight
    ? { maxWidth: args.maxWidth, maxHeight: args.maxHeight }
    : args.yes
      ? {}
      : await askMaxSize(rl)
  const maxWidth = maxSize.maxWidth
  const maxHeight = maxSize.maxHeight

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${mode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)
  console.log(`   Crop ratio 裁剪比例: ${ratioStr}`)
  if (maxWidth || maxHeight) {
    console.log(`   Max size 最大尺寸: ${maxWidth || 'none 无'} x ${maxHeight || 'none 无'}`)
  }
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
  console.log(colorize('✅ Done 完成!', 'bright'))
  console.log(`   Success 成功: ${colorize(successCount, 'green')} 张`)
  console.log(`   Failed 失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')} 张`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ Failed files 失败列表:', 'red'))
    failures.forEach(f => console.log(`   - ${f}`))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main()
