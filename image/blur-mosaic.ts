#!/usr/bin/env tsx

/**
 * Image Blur and Mosaic Tool
 *
 * Apply Gaussian blur or mosaic/pixelation effect to images or regions
 * Usage: tsx image/blur-mosaic.ts --input <directory> [options]
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

// CLI argument types
interface CliArgs {
  input?: string
  blur?: number
  mosaic?: number
  region?: string
  rect?: string
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
    else if (arg === '--blur' || arg === '-B') result.blur = parseInt(args[++i], 10)
    else if (arg === '--mosaic' || arg === '-M') result.mosaic = parseInt(args[++i], 10)
    else if (arg === '--region' || arg === '-r') result.region = args[++i]
    else if (arg === '--rect') result.rect = args[++i]
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
🖼️  Image Blur and Mosaic Tool

Usage: tsx image/blur-mosaic.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

Blur/Mosaic Options (mutually exclusive):
  --blur, -B <number>         Gaussian blur radius (1-100)
  --mosaic, -M <number>       Mosaic pixel size (2-50)

Region Options:
  --region, -r <region>       Target region: all, top, bottom, left, right, corner
                                all = entire image (default)
                                top = top 20%
                                bottom = bottom 20%
                                left = left 20%
                                right = right 20%
                                corner = bottom-right 25% x 25%
  --rect <x,y,w,h>            Custom rectangle region in pixels (x,y,width,height)

Output Options:
  --format, -f <format>       Output format: jpg, png, webp, keep (default: keep)
  --mode, -m <mode>           Output mode: overwrite, new-dir
  --output, -o <directory>    Output directory (required when mode=new-dir)
  --quality, -q <number>       Output quality 1-100 (default: 85)
  --yes, -y                    Skip all prompts, use defaults
  --help, -H                   Show this help message

Examples:
  tsx image/blur-mosaic.ts -i public/images/demo -B 10 --region all
  tsx image/blur-mosaic.ts -i public/images/demo -M 8 -r corner -m new-dir -o public/images/blurred
  tsx image/blur-mosaic.ts -i public/images/demo --blur 15 -r top --format jpg --yes
  tsx image/blur-mosaic.ts -i public/images/demo --mosaic 12 --rect 100,100,200,200
`)
}

// Region presets (as fractions of image dimensions)
const REGION_PRESETS: Record<string, { top?: number; bottom?: number; left?: number; right?: number }> = {
  'all': {},
  'top': { top: 0.2 },
  'bottom': { bottom: 0.2 },
  'left': { left: 0.2 },
  'right': { right: 0.2 },
  'corner': { bottom: 0.25, right: 0.25 }, // bottom-right corner (25% x 25%)
}

function parseRegion(input: string): { top?: number; bottom?: number; left?: number; right?: number } | null {
  const key = input.toLowerCase()
  if (REGION_PRESETS[key]) return REGION_PRESETS[key]
  return null
}

// Parse custom rect: x,y,w,h in pixels
function parseRect(input: string): { left: number; top: number; width: number; height: number } | null {
  const parts = input.split(',').map(p => parseInt(p.trim(), 10))
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0)) {
    return null
  }
  return { left: parts[0], top: parts[1], width: parts[2], height: parts[3] }
}

function askRegion(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Target region 目标区域:', 'bright'))
    console.log(colorize('   1) Whole image 整张图片', 'gray'))
    console.log(colorize('   2) Top area 顶部区域 (20%)', 'gray'))
    console.log(colorize('   3) Bottom area 底部区域 (20%)', 'gray'))
    console.log(colorize('   4) Left area 左侧区域 (20%)', 'gray'))
    console.log(colorize('   5) Right area 右侧区域 (20%)', 'gray'))
    console.log(colorize('   6) Bottom-right 右下角 (25% x 25%)', 'gray'))
    console.log(colorize('   7) Custom rectangle 自定义矩形区域', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-7): ', 'bright')).then(answer => {
      const map: Record<string, string> = {
        '1': 'all', '2': 'top', '3': 'bottom',
        '4': 'left', '5': 'right', '6': 'corner',
      }
      resolve(map[answer] || 'all')
    })
  })
}

function askBlurRadius(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Blur intensity 模糊强度:', 'bright'))
    console.log(colorize('   1) Light 轻度 (radius: 5)', 'gray'))
    console.log(colorize('   2) Medium 中度 (radius: 15)', 'gray'))
    console.log(colorize('   3) Strong 强度 (radius: 30)', 'gray'))
    console.log(colorize('   4) Custom 自定义', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright')).then(answer => {
      const map: Record<string, number> = { '1': 5, '2': 15, '3': 30 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '4') {
        question(rl, colorize('Enter blur radius 输入模糊半径 (1-100): ', 'bright')).then(v => {
          resolve(Math.min(100, Math.max(1, parseInt(v) || 15)))
        })
      } else resolve(15)
    })
  })
}

function askMosaicSize(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Mosaic granularity 马赛克粒度:', 'bright'))
    console.log(colorize('   1) Fine 细腻 (pixel: 4)', 'gray'))
    console.log(colorize('   2) Medium 中等 (pixel: 8)', 'gray'))
    console.log(colorize('   3) Coarse 粗粒 (pixel: 16)', 'gray'))
    console.log(colorize('   4) Custom 自定义', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright')).then(answer => {
      const map: Record<string, number> = { '1': 4, '2': 8, '3': 16 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '4') {
        question(rl, colorize('Enter pixel size 输入像素大小 (2-50): ', 'bright')).then(v => {
          resolve(Math.min(50, Math.max(2, parseInt(v) || 8)))
        })
      } else resolve(8)
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

// Calculate region bounds from presets or custom rect
function getRegionBounds(
  width: number,
  height: number,
  region: { top?: number; bottom?: number; left?: number; right?: number },
  customRect?: { left: number; top: number; width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  if (customRect) {
    // Clamp custom rect to image boundaries
    return {
      left: Math.min(customRect.left, width - 1),
      top: Math.min(customRect.top, height - 1),
      width: Math.min(customRect.width, width - customRect.left),
      height: Math.min(customRect.height, height - customRect.top),
    }
  }

  // Compute left origin: from left fraction or derived from right fraction
  const leftPx =
    region.left != null
      ? Math.floor(width * region.left)
      : region.right != null
        ? Math.floor(width * (1 - region.right))
        : 0;

  // Compute top origin: from top fraction or derived from bottom fraction
  const topPx =
    region.top != null
      ? Math.floor(height * region.top)
      : region.bottom != null
        ? Math.floor(height * (1 - region.bottom))
        : 0;

  return {
    left: leftPx,
    top: topPx,
    width: width - leftPx,
    height: height - topPx,
  };
}

// Apply blur or mosaic to an image region
async function applyBlurOrMosaic(
  inputPath: string,
  outputPath: string,
  options: {
    type: 'blur' | 'mosaic'
    blurRadius?: number
    mosaicSize?: number
    region: { top?: number; bottom?: number; left?: number; right?: number }
    customRect?: { left: number; top: number; width: number; height: number }
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
  const regionBounds = getRegionBounds(width, height, options.region, options.customRect)

  // When region is "all" (empty region object), apply to entire image
  const isWholeImage = Object.keys(options.region).length === 0 && !options.customRect

  if (isWholeImage) {
    // Apply blur/mosaic to entire image
    let pipeline = sharp(inputPath)

    if (options.type === 'blur') {
      pipeline = pipeline.blur(options.blurRadius!)
    } else {
      // Mosaic: resize down then back up
      const mosaicSize = options.mosaicSize!
      pipeline = pipeline.resize(
        Math.max(1, Math.floor(width / mosaicSize)),
        Math.max(1, Math.floor(height / mosaicSize)),
        { fit: 'fill' }
      )
      pipeline = pipeline.resize(width, height, { fit: 'fill' })
    }

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

    const finalOutput = await pipeline.toBuffer()
    fs.writeFileSync(outputPath, finalOutput)
  } else {
    // Apply blur/mosaic to specific region only
    const { left, top, width: regionWidth, height: regionHeight } = regionBounds

    // Extract the region, apply effect, then composite back
    let regionPipeline = sharp(inputPath)
      .extract({ left, top, width: regionWidth, height: regionHeight })

    if (options.type === 'blur') {
      regionPipeline = regionPipeline.blur(options.blurRadius!)
    } else {
      // Mosaic: resize down then back up
      const mosaicSize = options.mosaicSize!
      regionPipeline = regionPipeline.resize(
        Math.max(1, Math.floor(regionWidth / mosaicSize)),
        Math.max(1, Math.floor(regionHeight / mosaicSize)),
        { fit: 'fill' }
      )
      regionPipeline = regionPipeline.resize(regionWidth, regionHeight, { fit: 'fill' })
    }

    // Composite the processed region back onto the original image
    const processedRegion = await regionPipeline.toBuffer()

    let compositePipeline = sharp(inputPath)
      .composite([{
        input: processedRegion,
        left,
        top,
      }])

    // Determine output format
    const originalExt = path.extname(inputPath).toLowerCase()

    if (options.format !== 'keep') {
      const formatMap: Record<string, 'jpeg' | 'png' | 'webp'> = {
        jpg: 'jpeg',
        png: 'png',
        webp: 'webp',
      }
      compositePipeline = compositePipeline.toFormat(formatMap[options.format], { quality: options.quality })
    } else {
      if (originalExt === '.jpg' || originalExt === '.jpeg') {
        compositePipeline = compositePipeline.jpeg({ quality: options.quality })
      } else if (originalExt === '.png') {
        compositePipeline = compositePipeline.png()
      } else if (originalExt === '.webp') {
        compositePipeline = compositePipeline.webp({ quality: options.quality })
      }
    }

    const finalOutput = await compositePipeline.toBuffer()
    fs.writeFileSync(outputPath, finalOutput)
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

  // Validate mutually exclusive blur/mosaic options
  if (args.blur !== undefined && args.mosaic !== undefined) {
    console.error(colorize('❌ Blur and mosaic cannot be used together 模糊和马赛克不能同时使用，请选择其一', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  if (args.blur === undefined && args.mosaic === undefined) {
    console.error(colorize('❌ Please specify effect type 请指定效果类型: --blur <radius> or --mosaic <size>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  // Validate ranges
  if (args.blur !== undefined && (args.blur < 1 || args.blur > 100)) {
    console.error(colorize('❌ Blur radius must be between 模糊半径必须在 1-100 范围内', 'red'))
    process.exit(1)
  }

  if (args.mosaic !== undefined && (args.mosaic < 2 || args.mosaic > 50)) {
    console.error(colorize('❌ Mosaic pixel size must be between 马赛克像素大小必须在 2-50 范围内', 'red'))
    process.exit(1)
  }

  // Parse custom rect if provided
  let customRect: { left: number; top: number; width: number; height: number } | undefined
  if (args.rect) {
    const parsed = parseRect(args.rect)
    if (!parsed) {
      console.error(colorize('❌ Invalid rect parameter 无效的矩形参数，格式应为: x,y,width,height (e.g. 如 100,100,200,200)', 'red'))
      process.exit(1)
    }
    customRect = parsed
  }

  const inputPath = path.resolve(args.input)
  const imageFiles = getImageFiles(inputPath)

  const isSingleFile = fs.statSync(inputPath).isFile()

  console.log(colorize('\n🖼️  Image Blur and Mosaic Tool 图片模糊/马赛克工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Gather parameters
  const effectType = args.blur !== undefined ? 'blur' : 'mosaic'
  const blurRadius = args.blur ?? (args.yes ? 15 : await askBlurRadius(rl))
  const mosaicSize = args.mosaic ?? (args.yes ? 8 : await askMosaicSize(rl))

  const regionStr = args.region || (args.yes ? 'all' : await askRegion(rl))
  const region = parseRegion(regionStr) || {}

  const format = (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'
  const quality = args.quality || 85

  let outputDir = inputPath
  if (mode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'blurred')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'blurred')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${mode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)
  console.log(`   Effect type 效果类型: ${effectType === 'blur' ? `Gaussian blur 高斯模糊 (radius: ${blurRadius})` : `Mosaic 马赛克 (pixel: ${mosaicSize})`}`)
  console.log(`   Target region 目标区域: ${customRect ? `Custom rectangle 自定义矩形 (${customRect.left},${customRect.top},${customRect.width},${customRect.height})` : regionStr}`)
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
      await applyBlurOrMosaic(inputPath, outputPath, {
        type: effectType as 'blur' | 'mosaic',
        blurRadius,
        mosaicSize,
        region,
        customRect,
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

  process.exit(failCount > 0 ? 1 : 0)
}

main()