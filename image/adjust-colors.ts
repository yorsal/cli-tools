#!/usr/bin/env tsx

/**
 * Image Batch Color Adjustment Tool
 *
 * Adjust brightness, contrast, saturation and apply filter effects
 * Usage: tsx scripts/adjust-colors.ts --input <directory> [options]
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

// CLI argument types
interface CliArgs {
  input?: string
  brightness?: number
  contrast?: number
  saturation?: number
  grayscale?: boolean
  sepia?: boolean
  sharpen?: boolean
  blur?: boolean
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
    else if (arg === '--brightness' || arg === '-b') result.brightness = parseInt(args[++i], 10)
    else if (arg === '--contrast' || arg === '-c') result.contrast = parseInt(args[++i], 10)
    else if (arg === '--saturation' || arg === '-s') result.saturation = parseInt(args[++i], 10)
    else if (arg === '--grayscale') result.grayscale = true
    else if (arg === '--sepia') result.sepia = true
    else if (arg === '--sharpen') result.sharpen = true
    else if (arg === '--blur') result.blur = true
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
📷 Image Batch Color Adjustment Tool

Usage: tsx scripts/adjust-colors.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

Adjustment Options:
  -b, --brightness <number>  Brightness -100 to 100 (default: 0)
  -c, --contrast <number>   Contrast -100 to 100 (default: 0)
  -s, --saturation <number>  Saturation -100 to 100 (default: 0)

Filter Presets:
  --grayscale               Convert to grayscale
  --sepia                   Sepia tone effect
  --sharpen                 Sharpen image
  --blur                    Gaussian blur (light)

Options:
  -f, --format <format>     Output format: jpg, png, webp, keep (default: keep)
  -m, --mode <mode>         Output mode: overwrite, new-dir
  -o, --output <directory>  Output directory (required when mode=new-dir)
  -q, --quality <number>    Output quality 1-100 (default: 85)
  -y, --yes                 Skip all prompts, use defaults
  --help, -H                Show this help message

Notes:
  - Adjustments and filters can be combined
  - Filters are applied after numeric adjustments

Examples:
  tsx scripts/adjust-colors.ts -i public/images/demo --brightness 10 --contrast 5 --yes
  tsx scripts/adjust-colors.ts -i public/images/demo --sepia -m overwrite --yes
  tsx scripts/adjust-colors.ts -i public/images/demo --grayscale --sharpen -m new-dir -o public/images/adjusted
`)
}

function askAdjustments(rl: Interface): Promise<{ brightness?: number; contrast?: number; saturation?: number }> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Color adjustments 颜色调整:', 'bright'))
    console.log(colorize('   Enter values from 输入 -100 to 100 的值，留空跳过该项', 'gray'))
    question(rl, colorize(`   Brightness 亮度 (-100 to 100, Enter to skip 回车跳过): `, 'bright')).then(b => {
      question(rl, colorize(`   Contrast 对比度 (-100 to 100, Enter to skip 回车跳过): `, 'bright')).then(c => {
        question(rl, colorize(`   Saturation 饱和度 (-100 to 100, Enter to skip 回车跳过): `, 'bright')).then(s => {
          resolve({
            brightness: b ? parseInt(b, 10) : undefined,
            contrast: c ? parseInt(c, 10) : undefined,
            saturation: s ? parseInt(s, 10) : undefined,
          })
        })
      })
    })
  })
}

function askFilters(rl: Interface): Promise<{ grayscale?: boolean; sepia?: boolean; sharpen?: boolean; blur?: boolean }> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Filter effects 滤镜效果:', 'bright'))
    console.log(colorize('   1) Grayscale 灰度 (grayscale)', 'gray'))
    console.log(colorize('   2) Sepia 怀旧/褐色 (sepia)', 'gray'))
    console.log(colorize('   3) Sharpen 锐化 (sharpen)', 'gray'))
    console.log(colorize('   4) Blur 模糊 (blur)', 'gray'))
    console.log(colorize('   Multiple filters separated by space 多个滤镜用空格分隔，如: 1 3', 'gray'))
    question(rl, colorize('\nSelect 选择 (Enter to skip 回车跳过): ', 'bright')).then(answer => {
      const selected = answer.split(' ').map(n => n.trim()).filter(n => n)
      resolve({
        grayscale: selected.includes('1'),
        sepia: selected.includes('2'),
        sharpen: selected.includes('3'),
        blur: selected.includes('4'),
      })
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

// Sepia matrix for recomb transformation (3x3)
type Matrix3x3 = [[number, number, number], [number, number, number], [number, number, number]]
const sepiaMatrix: Matrix3x3 = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
]

async function adjustImage(
  inputPath: string,
  outputPath: string,
  brightness: number,
  contrast: number,
  saturation: number,
  grayscale: boolean,
  sepia: boolean,
  sharpen: boolean,
  blur: boolean,
  format: 'jpg' | 'png' | 'webp' | 'keep',
  quality: number
): Promise<void> {
  // When input and output are the same file, write to a temp file first then rename
  // to avoid "Cannot use same file for input and output" error
  const useTempFile = inputPath === outputPath
  const tempPath = useTempFile ? `${inputPath}.tmp.${Date.now()}` : null

  try {
    // Calculate if any adjustments are needed
    const hasAdjustments = brightness !== 0 || contrast !== 0 || saturation !== 0
    const hasFilters = grayscale || sepia || sharpen || blur

    // If no adjustments and no filters needed, just copy if format conversion is needed
    if (!hasAdjustments && !hasFilters) {
      if (format === 'keep') {
        return
      }
    }

    let pipeline = sharp(inputPath)

    // Apply brightness, contrast, saturation using modulate
    // sharp's modulate: brightness 0-2 (1 is default), saturation 0-2 (1 is default)
    const brightnessFactor = 1 + brightness / 100
    const saturationFactor = 1 + saturation / 100

    if (brightness !== 0 || saturation !== 0) {
      pipeline = pipeline.modulate({
        brightness: brightnessFactor,
        saturation: saturationFactor,
      })
    }

    // Apply contrast using linear transformation
    // contrast: -100 to 100, convert to slope factor
    if (contrast !== 0) {
      const contrastFactor = (contrast + 100) / 100
      // Apply linear transformation to each channel
      pipeline = pipeline.linear(contrastFactor, -(128 * (contrastFactor - 1)))
    }

    // Apply grayscale filter
    if (grayscale) {
      pipeline = pipeline.grayscale()
    }

    // Apply sepia filter using recomb
    if (sepia) {
      pipeline = pipeline.recomb(sepiaMatrix)
    }

    // Apply sharpen filter
    if (sharpen) {
      pipeline = pipeline.sharpen()
    }

    // Apply blur filter
    if (blur) {
      pipeline = pipeline.blur()
    }

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

function describeAdjustments(b: number, c: number, s: number): string {
  const parts: string[] = []
  if (b !== 0) parts.push(`Brightness 亮度 ${b}`)
  if (c !== 0) parts.push(`Contrast 对比度 ${c}`)
  if (s !== 0) parts.push(`Saturation 饱和度 ${s}`)
  return parts.length > 0 ? parts.join(', ') : 'None 无'
}

function describeFilters(g: boolean, sep: boolean, sh: boolean, bl: boolean): string {
  const parts: string[] = []
  if (g) parts.push('Grayscale 灰度')
  if (sep) parts.push('Sepia 褐色')
  if (sh) parts.push('Sharpen 锐化')
  if (bl) parts.push('Blur 模糊')
  return parts.length > 0 ? parts.join(', ') : 'None 无'
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

  console.log(colorize('\n📷 Image Batch Color Adjustment Tool 图片批量颜色调整工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Get adjustments
  let brightness = args.brightness ?? 0
  let contrast = args.contrast ?? 0
  let saturation = args.saturation ?? 0

  if (args.brightness === undefined && args.contrast === undefined && args.saturation === undefined) {
    if (!args.yes) {
      const adj = await askAdjustments(rl)
      brightness = adj.brightness ?? 0
      contrast = adj.contrast ?? 0
      saturation = adj.saturation ?? 0
    }
  }

  // Validate adjustment ranges
  const validateRange = (val: number, name: string) => {
    if (val < -100 || val > 100) {
      console.error(colorize(`❌ ${name} value must be between ${name} 值必须在 -100 到 100 之间`, 'red'))
      rl.close()
      process.exit(1)
    }
  }
  validateRange(brightness, '亮度')
  validateRange(contrast, '对比度')
  validateRange(saturation, '饱和度')

  // Get filters
  let grayscale = args.grayscale ?? false
  let sepia = args.sepia ?? false
  let sharpen = args.sharpen ?? false
  let blur = args.blur ?? false

  if (!args.grayscale && !args.sepia && !args.sharpen && !args.blur) {
    if (!args.yes) {
      const filters = await askFilters(rl)
      grayscale = filters.grayscale ?? false
      sepia = filters.sepia ?? false
      sharpen = filters.sharpen ?? false
      blur = filters.blur ?? false
    }
  }

  const hasAdjustments = brightness !== 0 || contrast !== 0 || saturation !== 0
  const hasFilters = grayscale || sepia || sharpen || blur

  if (!hasAdjustments && !hasFilters) {
    console.error(colorize('❌ Please specify at least one adjustment or filter 请至少指定一个调整项或滤镜', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    rl.close()
    process.exit(1)
  }

  const modeStr = args.mode || (args.yes ? 'overwrite' : await askMode(rl))
  const outputMode = modeStr as 'overwrite' | 'new-dir'

  let outputDir = inputPath
  if (outputMode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'adjusted')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'adjusted')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  const format = args.format && args.format !== 'keep'
    ? args.format
    : (outputMode === 'new-dir' && !args.yes && !args.format
      ? await askFormat(rl)
      : 'keep') as 'jpg' | 'png' | 'webp' | 'keep'
  const quality = args.quality || 85

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${outputMode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)
  console.log(`   Adjustments 调整项: ${describeAdjustments(brightness, contrast, saturation)}`)
  console.log(`   Filters 滤镜: ${describeFilters(grayscale, sepia, sharpen, blur)}`)
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
    let outputPath: string
    if (outputMode === 'overwrite') {
      if (format !== 'keep') {
        // Change extension to match new format
        const parsed = path.parse(inputPath)
        outputPath = path.join(parsed.dir, parsed.name + '.' + format)
      } else {
        outputPath = inputPath
      }
    } else {
      outputPath = path.join(outputDir, outputFilename)
    }

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} Processing 处理 [${i + 1}/${imageFiles.length}] ${filename} ... `
    )

    try {
      await adjustImage(
        inputPath,
        outputPath,
        brightness,
        contrast,
        saturation,
        grayscale,
        sepia,
        sharpen,
        blur,
        format,
        quality
      )
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
