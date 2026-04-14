#!/usr/bin/env tsx

/**
 * Image Batch Resize Tool
 *
 * Resize images in a directory using various resize modes
 * Usage: tsx scripts/resize-images.ts --input <directory> [options]
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

// CLI argument types
interface CliArgs {
  input?: string
  width?: number
  height?: number
  percent?: number
  longestEdge?: number
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
    else if (arg === '--width' || arg === '-W') result.width = parseInt(args[++i], 10)
    else if (arg === '--height' || arg === '-h') result.height = parseInt(args[++i], 10)
    else if (arg === '--percent' || arg === '-p') result.percent = parseInt(args[++i], 10)
    else if (arg === '--longest-edge' || arg === '-l') result.longestEdge = parseInt(args[++i], 10)
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
📷 Image Batch Resize Tool

Usage: tsx scripts/resize-images.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

Resize Modes (mutually exclusive):
  --width, -W <pixels>       Target width (use with --height for exact dimensions)
  --height, -h <pixels>      Target height (use with --width for exact dimensions)
  --percent, -p <number>     Scale percentage (50=half, 200=double)
  --longest-edge, -l <pixels> Scale so longest edge = this value

Options:
  --format, -f <format>     Output format: jpg, png, webp, keep (default: keep)
  --mode, -m <mode>         Output mode: overwrite, new-dir
  --output, -o <directory>  Output directory (required when mode=new-dir)
  --quality, -q <number>    Output quality 1-100 (default: 85)
  --yes, -y                  Skip all prompts, use defaults
  --help, -H                 Show this help message

Examples:
  tsx scripts/resize-images.ts -i photo.jpg --percent 50 --yes
  tsx scripts/resize-images.ts -i public/images/demo --percent 50 --yes
  tsx scripts/resize-images.ts -i public/images/demo -W 800 -h 600 -m overwrite --yes
  tsx scripts/resize-images.ts -i public/images/demo --longest-edge 1920 -m new-dir -o public/images/resized
`)
}

// Resize mode types
type ResizeMode = 'exact' | 'percent' | 'longest-edge'

function detectResizeMode(args: CliArgs): ResizeMode | null {
  const hasWidth = args.width !== undefined
  const hasHeight = args.height !== undefined
  const hasPercent = args.percent !== undefined
  const hasLongestEdge = args.longestEdge !== undefined

  // Count how many modes are specified
  const modesCount = (hasWidth ? 1 : 0) + (hasHeight ? 1 : 0) + (hasPercent ? 1 : 0) + (hasLongestEdge ? 1 : 0)

  // If width AND height are both specified, it's exact mode
  if (hasWidth && hasHeight) {
    return 'exact'
  }

  // If only percent is specified
  if (hasPercent && modesCount === 1) {
    return 'percent'
  }

  // If only longest-edge is specified
  if (hasLongestEdge && modesCount === 1) {
    return 'longest-edge'
  }

  // If width OR height alone is specified (use with preserve aspect)
  if ((hasWidth && !hasHeight) || (!hasWidth && hasHeight)) {
    return 'exact'
  }

  return null
}

function askResizeMode(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Resize mode 缩放模式:', 'bright'))
    console.log(colorize('   1) Exact size 精确尺寸 (W x H)', 'gray'))
    console.log(colorize('   2) Percentage 百分比缩放', 'gray'))
    console.log(colorize('   3) Longest edge 长边缩放 (maintain ratio)', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-3): ', 'bright')).then(answer => {
      switch (answer) {
        case '1': resolve('exact'); break
        case '2': resolve('percent'); break
        case '3': resolve('longest-edge'); break
        default: resolve('exact')
      }
    })
  })
}

async function askExactDimensions(rl: Interface): Promise<{ width?: number; height?: number }> {
  console.log(colorize('\n❓ Target size 目标尺寸:', 'bright'))
  const w = await question(rl, colorize('   Enter width 宽度 (pixels 像素, Enter to skip 回车跳过): ', 'bright'))
  const h = await question(rl, colorize('   Enter height 高度 (pixels 像素, Enter to skip 回车跳过): ', 'bright'))
  return {
    width: w ? parseInt(w, 10) : undefined,
    height: h ? parseInt(h, 10) : undefined,
  }
}

function askPercent(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Scale percentage 缩放百分比:', 'bright'))
    console.log(colorize('   e.g. 例如: 50 = half 一半, 200 = double 两倍', 'gray'))
    question(rl, colorize('\nEnter percentage 输入百分比: ', 'bright')).then(answer => {
      const value = parseInt(answer, 10)
      resolve(isNaN(value) ? 100 : value)
    })
  })
}

function askLongestEdge(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Longest edge target 长边目标尺寸:', 'bright'))
    question(rl, colorize('   Enter longest edge pixels 输入长边像素值: ', 'bright')).then(answer => {
      const value = parseInt(answer, 10)
      resolve(isNaN(value) ? 1920 : value)
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

async function resizeImage(
  inputPath: string,
  outputPath: string,
  mode: ResizeMode,
  width?: number,
  height?: number,
  percent?: number,
  longestEdge?: number,
  format: 'jpg' | 'png' | 'webp' | 'keep' = 'keep',
  quality: number = 85
): Promise<void> {
  // When input and output are the same file, write to a temp file first then rename
  // to avoid "Cannot use same file for input and output" error
  const useTempFile = inputPath === outputPath
  const tempPath = useTempFile ? `${inputPath}.tmp.${Date.now()}` : null

  try {
    const image = sharp(inputPath)
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error(`无法读取图片尺寸: ${inputPath}`)
    }

    let targetWidth: number
    let targetHeight: number
    const currentWidth = metadata.width
    const currentHeight = metadata.height

    switch (mode) {
      case 'exact':
        // Use provided width/height, or preserve original if only one is provided
        targetWidth = width || currentWidth
        targetHeight = height || currentHeight
        break

      case 'percent': {
        // Scale by percentage
        const scaleFactor = (percent || 100) / 100
        targetWidth = Math.round(currentWidth * scaleFactor)
        targetHeight = Math.round(currentHeight * scaleFactor)
        break
      }

      case 'longest-edge': {
        // Scale so longest edge equals the specified value
        const maxDimension = longestEdge || 1920
        const currentLongest = Math.max(currentWidth, currentHeight)
        if (currentLongest <= maxDimension) {
          // Image is already smaller than target, no resize needed
          targetWidth = currentWidth
          targetHeight = currentHeight
        } else {
          const scaleFactor = maxDimension / currentLongest
          targetWidth = Math.round(currentWidth * scaleFactor)
          targetHeight = Math.round(currentHeight * scaleFactor)
        }
        break
      }

      default:
        throw new Error(`未知的缩放模式: ${mode}`)
    }

    // Skip if dimensions are the same
    if (targetWidth === currentWidth && targetHeight === currentHeight) {
      // Just copy if format conversion is needed
      if (format === 'keep') {
        return
      }
    }

    let pipeline = sharp(inputPath).resize(targetWidth, targetHeight, {
      fit: 'fill', // Use fill to get exact dimensions without preserving aspect
    })

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

  console.log(colorize('\n📷 Image Batch Resize Tool 图片批量缩放工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Detect or ask for resize mode
  const detectedMode = detectResizeMode(args)

  // Validate mutually exclusive modes
  const hasDimensions = args.width !== undefined || args.height !== undefined
  const hasPercent = args.percent !== undefined

  // Check: width/height AND percent cannot be used together
  if (hasDimensions && hasPercent) {
    console.error(colorize('❌ Error 错误: cannot use --width/--height and --percent together 不能同时使用', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    rl.close()
    process.exit(1)
  }

  let mode: ResizeMode
  let width: number | undefined
  let height: number | undefined
  let percent: number | undefined
  let longestEdge: number | undefined

  if (detectedMode) {
    mode = detectedMode
  } else {
    const modeStr = args.yes ? 'exact' : await askResizeMode(rl)
    mode = modeStr as ResizeMode
  }

  // Get parameters based on mode
  switch (mode) {
    case 'exact':
      if (args.width || args.height) {
        width = args.width
        height = args.height
      } else if (args.yes) {
        width = 1920
        height = 1080
      } else {
        const dims = await askExactDimensions(rl)
        width = dims.width
        height = dims.height
      }
      break

    case 'percent':
      if (args.percent) {
        percent = args.percent
      } else if (args.yes) {
        percent = 50
      } else {
        percent = await askPercent(rl)
      }
      break

    case 'longest-edge':
      if (args.longestEdge) {
        longestEdge = args.longestEdge
      } else if (args.yes) {
        longestEdge = 1920
      } else {
        longestEdge = await askLongestEdge(rl)
      }
      break
  }

  const modeStr = args.mode || (args.yes ? 'overwrite' : await askMode(rl))
  const outputMode = modeStr as 'overwrite' | 'new-dir'

  let outputDir = inputPath
  if (outputMode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'resized')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'resized')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  const format = (outputMode === 'overwrite' || args.format === 'keep')
    ? 'keep'
    : (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const quality = args.quality || 85

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${outputMode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)
  console.log(`   Resize mode 缩放模式: ${mode === 'exact' ? 'Exact size 精确尺寸' : mode === 'percent' ? 'Percentage 百分比' : 'Longest edge 长边缩放'}`)

  if (mode === 'exact') {
    console.log(`   目标尺寸: ${width || '原宽'} x ${height || '原高'}`)
  } else if (mode === 'percent') {
    console.log(`   缩放比例: ${percent}%`)
  } else {
    console.log(`   长边目标: ${longestEdge} px`)
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
    const outputPath = outputMode === 'overwrite' ? inputPath : path.join(outputDir, outputFilename)

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} Processing 处理 [${i + 1}/${imageFiles.length}] ${filename} ... `
    )

    try {
      await resizeImage(inputPath, outputPath, mode, width, height, percent, longestEdge, format, quality)
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
