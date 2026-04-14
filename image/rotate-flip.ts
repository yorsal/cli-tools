#!/usr/bin/env tsx

/**
 * Image Batch Rotation and Flip Tool
 *
 * Rotate and flip images in a directory
 * Usage: tsx scripts/rotate-flip.ts --input <directory> [options]
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

// CLI argument types
interface CliArgs {
  input?: string
  rotate90?: boolean
  rotate180?: boolean
  rotate270?: boolean
  rotateCustom?: number
  flipHorizontal?: boolean
  flipVertical?: boolean
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
    else if (arg === '--rotate-90') result.rotate90 = true
    else if (arg === '--rotate-180') result.rotate180 = true
    else if (arg === '--rotate-270') result.rotate270 = true
    else if (arg === '--rotate-custom') result.rotateCustom = parseInt(args[++i], 10)
    else if (arg === '--flip-horizontal') result.flipHorizontal = true
    else if (arg === '--flip-vertical') result.flipVertical = true
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
📷 Image Batch Rotation and Flip Tool

Usage: tsx scripts/rotate-flip.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

Rotation (mutually exclusive, can combine with flip):
  --rotate-90                Rotate 90 degrees clockwise
  --rotate-180              Rotate 180 degrees
  --rotate-270              Rotate 270 degrees clockwise
  --rotate-custom <degrees> Custom rotation angle (0-360)

Flip:
  --flip-horizontal         Mirror along vertical axis (left-right)
  --flip-vertical           Mirror along horizontal axis (up-down)

Options:
  --format, -f <format>     Output format: jpg, png, webp, keep (default: keep)
  --mode, -m <mode>        Output mode: overwrite, new-dir
  --output, -o <directory> Output directory (required when mode=new-dir)
  --quality, -q <number>   Output quality 1-100 (default: 85)
  --yes, -y                 Skip all prompts, use defaults
  --help, -H                Show this help message

Examples:
  tsx scripts/rotate-flip.ts -i public/images/demo --rotate-90 --flip-horizontal --yes
  tsx scripts/rotate-flip.ts -i public/images/demo --rotate-180 -m new-dir -o public/images/rotated
  tsx scripts/rotate-flip.ts -i public/images/demo --rotate-custom 45 -f jpg -q 90
`)
}

// Calculate rotation angle for sharp
// sharp.rotate() rotates counter-clockwise, so:
// - 90° CW in user terms = 270° CCW in sharp = 270
// - 180° in user terms = 180° in sharp = 180
// - 270° CW in user terms = 90° CCW in sharp = 90
function calculateRotationAngle(args: CliArgs): number | null {
  if (args.rotate90) return 270
  if (args.rotate180) return 180
  if (args.rotate270) return 90
  if (args.rotateCustom !== undefined) {
    // Clamp to 0-360 and handle custom rotation
    const angle = args.rotateCustom % 360
    return angle < 0 ? angle + 360 : angle
  }
  return null
}

async function rotateFlipImage(
  inputPath: string,
  outputPath: string,
  rotationAngle: number | null,
  flipHorizontal: boolean,
  flipVertical: boolean,
  format: 'jpg' | 'png' | 'webp' | 'keep' = 'keep',
  quality: number = 85
): Promise<void> {
  // When input and output are the same file, write to a temp file first then rename
  // to avoid "Cannot use same file for input or output" error
  const useTempFile = inputPath === outputPath
  const tempPath = useTempFile ? `${inputPath}.tmp.${Date.now()}` : null

  try {
    let pipeline = sharp(inputPath)

    // Apply rotation (sharp rotates counter-clockwise)
    if (rotationAngle !== null) {
      pipeline = pipeline.rotate(rotationAngle)
    }

    // Apply flip operations
    // flip() mirrors vertically (up-down), flop() mirrors horizontally (left-right)
    if (flipVertical) {
      pipeline = pipeline.flip()
    }
    if (flipHorizontal) {
      pipeline = pipeline.flop()
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

async function askRotation(rl: Interface): Promise<number | null> {
  console.log(colorize('\n❓ Rotation 旋转方式:', 'bright'))
  console.log(colorize('   1) No rotation 不旋转', 'gray'))
  console.log(colorize('   2) 90° clockwise 顺时针90°', 'gray'))
  console.log(colorize('   3) 180° 旋转180°', 'gray'))
  console.log(colorize('   4) 270° clockwise 顺时针270°', 'gray'))
  console.log(colorize('   5) Custom angle 自定义角度', 'gray'))
  const answer = await question(rl, colorize('\nSelect 请选择 (1-5): ', 'bright'))
  const map: Record<string, number | null> = {
    '1': null,
    '2': 90,
    '3': 180,
    '4': 270,
  }
  if (map[answer] !== undefined) return map[answer]
  if (answer === '5') {
    const angleAnswer = await question(rl, colorize('Enter custom angle 输入自定义角度 (0-360): ', 'bright'))
    const angle = parseInt(angleAnswer, 10)
    if (isNaN(angle) || angle < 0 || angle > 360) {
      console.log(colorize('Invalid angle, using no rotation 无效角度，使用不旋转', 'yellow'))
      return null
    }
    return angle
  }
  return null
}

async function askFlip(rl: Interface): Promise<{ h: boolean; v: boolean }> {
  console.log(colorize('\n❓ Flip 翻转方式:', 'bright'))
  console.log(colorize('   1) No flip 不翻转', 'gray'))
  console.log(colorize('   2) Horizontal 水平翻转', 'gray'))
  console.log(colorize('   3) Vertical 垂直翻转', 'gray'))
  console.log(colorize('   4) Both 水平和垂直都翻转', 'gray'))
  const answer = await question(rl, colorize('\nSelect 请选择 (1-4): ', 'bright'))
  const map: Record<string, { h: boolean; v: boolean }> = {
    '1': { h: false, v: false },
    '2': { h: true, v: false },
    '3': { h: false, v: true },
    '4': { h: true, v: true },
  }
  return map[answer] || { h: false, v: false }
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

async function askMode(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Output mode 输出模式:', 'bright'))
    console.log(colorize('   1) Overwrite original 覆盖原图', 'gray'))
    console.log(colorize('   2) Output to new directory 输出到新目录', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-2): ', 'bright')).then(answer => {
      resolve(answer === '2' ? 'new-dir' : 'overwrite')
    })
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate required arguments
  if (!args.input) {
    console.error(colorize('❌ Please specify input 请指定输入: --input <directory>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  const inputPath = path.resolve(args.input)
  const imageFiles = getImageFiles(inputPath)

  const isSingleFile = fs.statSync(inputPath).isFile()

  console.log(colorize('\n📷 Image Batch Rotation and Flip Tool 图片批量旋转和翻转工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Calculate rotation angle - CLI overrides interactive
  const hasRotationCli = args.rotate90 || args.rotate180 || args.rotate270 || args.rotateCustom !== undefined
  const rotationAngle = hasRotationCli ? calculateRotationAngle(args) : (args.yes ? null : await askRotation(rl))

  // Determine flip - CLI overrides interactive
  const hasFlipCli = args.flipHorizontal || args.flipVertical
  const flipChoice = hasFlipCli
    ? { h: args.flipHorizontal || false, v: args.flipVertical || false }
    : (args.yes ? { h: false, v: false } : await askFlip(rl))

  // Determine output mode
  const modeStr = args.mode || (args.yes ? 'overwrite' : await askMode(rl))
  const outputMode = modeStr as 'overwrite' | 'new-dir'

  let outputDir = inputPath
  if (outputMode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'rotated')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'rotated')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  // Determine format
  const format = args.format || (args.yes ? 'keep' : await askFormat(rl)) as 'jpg' | 'png' | 'webp' | 'keep'
  const quality = args.quality || 85

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${outputMode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)

  // Describe rotation
  if (rotationAngle !== null) {
    let rotationDesc: string
    if (rotationAngle === 270) rotationDesc = '90° CW'
    else if (rotationAngle === 180) rotationDesc = '180°'
    else if (rotationAngle === 90) rotationDesc = '270° CW'
    else rotationDesc = `${rotationAngle}°`
    console.log(`   Rotation 旋转: ${rotationDesc}`)
  } else {
    console.log(`   Rotation 旋转: None 无`)
  }

  // Describe flip
  if (flipChoice.h && flipChoice.v) {
    console.log(`   Flip 翻转: Horizontal + Vertical 水平 + 垂直`)
  } else if (flipChoice.h) {
    console.log(`   Flip 翻转: Horizontal (mirror 水平镜像)`)
  } else if (flipChoice.v) {
    console.log(`   Flip 翻转: Vertical (flip 上下镜像)`)
  } else {
    console.log(`   Flip 翻转: None 无`)
  }

  console.log(`   Output format 输出格式: ${format === 'keep' ? 'Keep original 保持原格式' : format}`)
  console.log(`   Images 图片数量: ${imageFiles.length}`)

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
      await rotateFlipImage(
        inputPath,
        outputPath,
        rotationAngle,
        flipChoice.h,
        flipChoice.v,
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
  console.log(`   Success 成功: ${colorize(successCount, 'green')}`)
  console.log(`   Failed 失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')}`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ Failed files 失败列表:', 'red'))
    failures.forEach(f => console.log(`   - ${f}`))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main()
