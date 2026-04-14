#!/usr/bin/env tsx

/**
 * Image Watermark Tool
 *
 * Add text or image watermark to images
 * Usage: tsx image/add-watermark.ts --input <directory> [options]
 */

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Interface } from 'readline'
import { colorize, createInterface, question, getImageFiles, ensureUniqueDir } from '../src/utils/index.js'

// CLI argument types
interface CliArgs {
  input?: string
  text?: string
  image?: string
  position?: 'northwest' | 'north' | 'northeast' | 'west' | 'center' | 'east' | 'southwest' | 'south' | 'southeast' | 'tile'
  opacity?: number
  fontSize?: number
  color?: string
  margin?: number
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
    else if (arg === '--text' || arg === '-t') result.text = args[++i]
    else if (arg === '--image' || arg === '-m') result.image = args[++i]
    else if (arg === '--position' || arg === '-p') result.position = args[++i] as CliArgs['position']
    else if (arg === '--opacity' || arg === '-o') result.opacity = parseFloat(args[++i])
    else if (arg === '--font-size' || arg === '-s') result.fontSize = parseInt(args[++i], 10)
    else if (arg === '--color' || arg === '-c') result.color = args[++i]
    else if (arg === '--margin' || arg === '-M') result.margin = parseInt(args[++i], 10)
    else if (arg === '--format' || arg === '-f') result.format = args[++i] as CliArgs['format']
    else if (arg === '--mode' || arg === '-d') result.mode = args[++i] as CliArgs['mode']
    else if (arg === '--output' || arg === '-O') result.output = args[++i]
    else if (arg === '--quality' || arg === '-q') result.quality = parseInt(args[++i], 10)
    else if (arg === '--yes' || arg === '-y') result.yes = true
    else if (arg === '--help' || arg === '-H') result.help = true
  }
  return result
}

function showHelp(): void {
  console.log(`
🖼️  Image Watermark Tool

Usage: tsx image/add-watermark.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Source image file or directory

Options (Watermark Source):
  --text, -t <text>          Text watermark (mutually exclusive with --image)
  --image, -m <path>         Image watermark file path (mutually exclusive with --text)

Options (Watermark Style):
  --position, -p <position>  Position: north-west, north, north-east, west, center,
                              east, south-west, south, south-east, tile (default: south-east)
  --opacity, -o <0-1>        Opacity 0-1 (default: 0.5)
  --font-size, -s <size>     Font size in pixels for text watermark (default: 48)
  --color <color>            Text color (default: white with opacity)

Options (Output):
  --format, -f <format>      Output format: jpg, png, webp, keep (default: keep)
  --mode, -d <mode>          Output mode: overwrite, new-dir
  --output, -O <directory>   Output directory (required when mode=new-dir)
  --quality, -q <number>     Output quality 1-100 (default: 85)
  --margin, -M <pixels>      Margin from edge (default: 20)
  --yes, -y                   Skip all prompts, use defaults
  --help, -H                  Show this help message

Examples:
  tsx image/add-watermark.ts -i public/images/demo -t "Copyright"
  tsx image/add-watermark.ts -i public/images/demo -t "© 2024" -p center -o 0.3
  tsx image/add-watermark.ts -i public/images/demo -m logo.png -p south-east -o 0.4
  tsx image/add-watermark.ts -i public/images/demo -t "Demo" --format png -d new-dir -O public/images/watermarked
`)
}

function askWatermarkType(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Watermark type 水印类型:', 'bright'))
    console.log(colorize('   1) Text watermark 文字水印', 'gray'))
    console.log(colorize('   2) Image watermark 图片水印', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-2): ', 'bright')).then(answer => {
      resolve(answer === '2' ? 'image' : 'text')
    })
  })
}

function askTextWatermark(rl: Interface): Promise<string> {
  return question(rl, colorize('\nEnter watermark text 输入水印文字: ', 'bright'))
}

function askImageWatermark(rl: Interface): Promise<string> {
  return question(rl, colorize('\nEnter watermark image path 输入水印图片路径: ', 'bright'))
}

function askPosition(rl: Interface): Promise<string> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Watermark position 水印位置:', 'bright'))
    console.log(colorize('   1) Top-left 左上角    2) Top-center 上方居中    3) Top-right 右上角', 'gray'))
    console.log(colorize('   4) Left-center 左居中    5) Center 居中        6) Right-center 右居中', 'gray'))
    console.log(colorize('   7) Bottom-left 左下角    8) Bottom-center 下方居中    9) Bottom-right 右下角', 'gray'))
    console.log(colorize('   10) Tiled 平铺', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-10): ', 'bright')).then(answer => {
      const map: Record<string, string> = {
        '1': 'northwest', '2': 'north', '3': 'northeast',
        '4': 'west', '5': 'center', '6': 'east',
        '7': 'southwest', '8': 'south', '9': 'southeast',
        '10': 'tile',
      }
      resolve(map[answer] || 'southeast')
    })
  })
}

function askOpacity(rl: Interface): Promise<number> {
  return new Promise(resolve => {
    console.log(colorize('\n❓ Watermark opacity 水印透明度:', 'bright'))
    console.log(colorize('   1) 10% (very light 很淡)', 'gray'))
    console.log(colorize('   2) 30% (light 淡)', 'gray'))
    console.log(colorize('   3) 50% (medium 中等)', 'gray'))
    console.log(colorize('   4) 70% (dark 较深)', 'gray'))
    console.log(colorize('   5) Custom 自定义', 'gray'))
    question(rl, colorize('\nSelect 请选择 (1-5): ', 'bright')).then(answer => {
      const map: Record<string, number> = { '1': 0.1, '2': 0.3, '3': 0.5, '4': 0.7 }
      if (map[answer]) resolve(map[answer])
      else if (answer === '5') {
        question(rl, colorize('Enter opacity 透明度 (0-1, e.g. 如 0.4): ', 'bright')).then(v => {
          resolve(Math.min(1, Math.max(0, parseFloat(v) || 0.5)))
        })
      } else resolve(0.5)
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

// Create SVG text watermark
function createTextWatermarkSvg(
  text: string,
  fontSize: number,
  color: string,
  opacity: number
): Buffer {
  const width = Math.ceil(text.length * fontSize * 0.6)
  const height = Math.ceil(fontSize * 1.5)

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .watermark {
          font-family: Arial, sans-serif;
          font-size: ${fontSize}px;
          fill: ${color};
          opacity: ${opacity};
        }
      </style>
      <text x="0" y="${fontSize}" class="watermark">${escapeXml(text)}</text>
    </svg>
  `
  return Buffer.from(svg)
}

// Escape XML special characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function addWatermark(
  inputPath: string,
  outputPath: string,
  options: {
    text?: string
    imagePath?: string
    position: string
    opacity: number
    fontSize: number
    color: string
    margin: number
    format: 'jpg' | 'png' | 'webp' | 'keep'
    quality: number
  }
): Promise<void> {
  const image = sharp(inputPath)
  const metadata = await image.metadata()

  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot read image size 无法读取图片尺寸: ${inputPath}`)
  }

  let compositeOptions: { input: Buffer; gravity: keyof sharp.Gravity | undefined; tile: boolean }

  if (options.text) {
    // Create text watermark
    const svg = createTextWatermarkSvg(options.text, options.fontSize, options.color, options.opacity)
    compositeOptions = {
      input: svg,
      gravity: options.position as keyof sharp.Gravity,
      tile: options.position === 'tile',
    }
  } else if (options.imagePath) {
    // Load and prepare image watermark
    const watermarkImage = sharp(options.imagePath)
    const watermarkMeta = await watermarkImage.metadata()

    if (!watermarkMeta.width || !watermarkMeta.height) {
      throw new Error(`Cannot read watermark image size 无法读取水印图片尺寸: ${options.imagePath}`)
    }

    // Resize watermark if it's larger than the base image
    let resizeOptions: sharp.ResizeOptions | undefined
    if (watermarkMeta.width > metadata.width || watermarkMeta.height > metadata.height) {
      resizeOptions = {
        width: Math.floor(metadata.width * 0.5),
        height: Math.floor(metadata.height * 0.5),
        fit: 'inside',
      }
    }

    const watermarkBuffer = await watermarkImage
      .ensureAlpha(options.opacity)
      .resize(resizeOptions)
      .toBuffer()

    compositeOptions = {
      input: watermarkBuffer,
      gravity: options.position as keyof sharp.Gravity,
      tile: options.position === 'tile',
    }
  } else {
    throw new Error('Must provide text or image watermark 必须提供文字或图片水印')
  }

  // Build pipeline - process to buffer first to avoid input/output conflict
  let pipeline = sharp(inputPath).composite([compositeOptions])

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
  const outputBuffer = await pipeline.toBuffer()
  fs.writeFileSync(outputPath, outputBuffer)
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

  console.log(colorize('\n🖼️  Image Watermark Tool 图片水印工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Input 输入: ${inputPath}`, 'cyan'))
  console.log(colorize(`🖼️  Found 发现 ${imageFiles.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Determine watermark type
  const watermarkType = args.text ? 'text' : args.image ? 'image' : await askWatermarkType(rl)

  // Get watermark content
  const text = args.text || (watermarkType === 'text' ? await askTextWatermark(rl) : undefined)
  const imagePath = args.image || (watermarkType === 'image' ? await askImageWatermark(rl) : undefined)

  if (watermarkType === 'image' && imagePath && !fs.existsSync(imagePath)) {
    console.error(colorize(`❌ 水印图片不存在: ${imagePath}`, 'red'))
    rl.close()
    process.exit(1)
  }

  if (watermarkType === 'text' && !text) {
    console.error(colorize('❌ Please provide text watermark content 请提供文字水印内容', 'red'))
    rl.close()
    process.exit(1)
  }

  // Gather parameters
  const position = args.position || (args.yes ? 'southeast' : await askPosition(rl))
  const opacity = args.opacity ?? (args.yes ? 0.5 : await askOpacity(rl))
  const fontSize = args.fontSize || 48
  const color = args.color || 'white'
  const margin = args.margin || 20
  const format = (args.format || (args.yes ? 'keep' : await askFormat(rl))) as 'jpg' | 'png' | 'webp' | 'keep'
  const mode = (args.mode || (args.yes ? 'overwrite' : await askMode(rl))) as 'overwrite' | 'new-dir'
  const quality = args.quality || 85

  let outputDir = inputPath
  if (mode === 'new-dir') {
    if (isSingleFile) {
      const targetDir = args.output || path.join(path.dirname(inputPath), 'watermarked')
      outputDir = ensureUniqueDir(targetDir)
    } else {
      const targetDir = args.output || path.join(inputPath, 'watermarked')
      outputDir = ensureUniqueDir(targetDir)
    }
  }

  // Show summary
  console.log(colorize('\n📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Input 输入: ${inputPath}`)
  console.log(`   Output mode 输出模式: ${mode === 'overwrite' ? 'Overwrite original 覆盖原图' : `New directory 新目录 (${outputDir})`}`)
  console.log(`   Watermark type 水印类型: ${watermarkType === 'text' ? `Text 文字: "${text}"` : `Image 图片: ${imagePath}`}`)
  console.log(`   Position 位置: ${position}`)
  console.log(`   Opacity 透明度: ${Math.round(opacity * 100)}%`)
  if (watermarkType === 'text') {
    console.log(`   Font size 字体大小: ${fontSize}px`)
    console.log(`   Color 字体颜色: ${color}`)
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
      await addWatermark(inputPath, outputPath, {
        text,
        imagePath,
        position,
        opacity,
        fontSize,
        color,
        margin,
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
