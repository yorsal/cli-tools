#!/usr/bin/env tsx

/**
 * Images to PDF Tool
 *
 * Combine multiple images into a single PDF file
 * Usage: tsx image/images-to-pdf.ts --input <images...> --output <output.pdf> [options]
 */

import fs from 'fs'
import path from 'path'
import { glob } from 'glob'
import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { colorize, createInterface, question } from '../src/utils/index.js'

// CLI argument types
interface CliArgs {
  input?: string[]
  output?: string
  layout?: 'portrait' | 'landscape' | 'auto'
  pageSize?: 'A4' | 'Letter' | 'Legal' | 'A3'
  margin?: number
  quality?: number
  gap?: number
  yes?: boolean
  help?: boolean
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' || arg === '-i') {
      // Collect all values until the next flag
      const inputs: string[] = []
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        inputs.push(args[++i])
      }
      result.input = inputs
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i]
    } else if (arg === '--layout' || arg === '-l') {
      result.layout = args[++i] as CliArgs['layout']
    } else if (arg === '--page-size' || arg === '-s') {
      result.pageSize = args[++i] as CliArgs['pageSize']
    } else if (arg === '--margin' || arg === '-m') {
      result.margin = parseInt(args[++i], 10)
    } else if (arg === '--quality' || arg === '-q') {
      result.quality = parseInt(args[++i], 10)
    } else if (arg === '--gap' || arg === '-g') {
      result.gap = parseInt(args[++i], 10)
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true
    } else if (arg === '--help' || arg === '-H') {
      result.help = true
    }
  }
  return result
}

function showHelp(): void {
  console.log(`
📄 Images to PDF Tool

Usage: tsx image/images-to-pdf.ts --input <images...> --output <output.pdf> [options]

Required:
  --input, -i <images...>    Input image files, directories, or glob patterns
  --output, -o <file>       Output PDF file

Options:
  --layout, -l <mode>       Page layout: portrait, landscape, auto (default: auto)
  --page-size, -s <size>    Page size: A4, Letter, Legal, A3 (default: A4)
  --margin, -m <pixels>     Page margin (default: 0)
  --quality, -q <1-100>     JPEG quality for compression (default: 85)
  --gap, -g <pixels>        Gap between images (default: 0)
  --yes, -y                  Skip all prompts, use defaults
  --help, -H                 Show this help message

Examples:
  tsx image/images-to-pdf.ts -i photo1.jpg photo2.jpg photo3.jpg -o output.pdf
  tsx image/images-to-pdf.ts -i ./photos -o output.pdf
  tsx image/images-to-pdf.ts -i "*.jpg" -o photos.pdf
  tsx image/images-to-pdf.ts -i *.png -o images.pdf -l landscape -s A4 -m 20
`)
}

// Supported image extensions
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff', '.bmp']

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

function expandGlob(pattern: string): string[] {
  return glob.sync(pattern)
}

function resolveInputPaths(patterns: string[]): string[] {
  const paths: string[] = []

  for (const pattern of patterns) {
    const resolved = path.resolve(pattern)

    if (!fs.existsSync(resolved)) {
      continue
    }

    const stat = fs.statSync(resolved)

    if (pattern.includes('*') || pattern.includes('?')) {
      // Handle glob patterns
      const matches = expandGlob(pattern)
      paths.push(...matches.filter(isImageFile))
    } else if (stat.isDirectory()) {
      // Handle directory - read all images from directory
      const files = fs.readdirSync(resolved)
      for (const file of files) {
        const filePath = path.join(resolved, file)
        if (isImageFile(file) && fs.existsSync(filePath)) {
          paths.push(filePath)
        }
      }
    } else {
      // Single file
      if (isImageFile(pattern) && fs.existsSync(pattern)) {
        paths.push(pattern)
      }
    }
  }

  return paths.map(p => path.resolve(p))
}

// Page size definitions (in points, 1 point = 1/72 inch)
const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  Legal: [612, 1008],
  A3: [841.89, 1190.55],
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imagePath).metadata()
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
  }
}

async function processImageToBuffer(
  imagePath: string,
  options: { width?: number; height?: number; quality: number }
): Promise<Buffer> {
  let pipeline = sharp(imagePath)

  if (options.width || options.height) {
    pipeline = pipeline.resize(options.width, options.height, { fit: 'inside' })
  }

  return pipeline.jpeg({ quality: options.quality }).toBuffer()
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate required arguments
  if (!args.input || args.input.length === 0) {
    console.error(colorize('❌ Please specify input images 请指定输入图片: --input <images...>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  if (!args.output) {
    console.error(colorize('❌ Please specify output file 请指定输出文件: --output <output.pdf>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  // Resolve input paths
  const inputPaths = resolveInputPaths(args.input)

  if (inputPaths.length === 0) {
    console.error(colorize('❌ No supported images found 未找到支持的图片文件', 'red'))
    console.log(colorize(`   Supported formats 支持的格式: ${SUPPORTED_EXTENSIONS.join(', ')}`, 'gray'))
    process.exit(1)
  }

  // Sort by filename for consistent ordering
  inputPaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const outputPath = path.resolve(args.output)
  const layout = args.layout || 'auto'
  const pageSize = PAGE_SIZES[args.pageSize || 'A4']
  const margin = args.margin ?? 0
  const quality = args.quality ?? 85
  const gap = args.gap ?? 0

  console.log(colorize('\n📄 Images to PDF Tool 图片转PDF工具', 'bright'))
  console.log(colorize('='.repeat(50), 'gray'))
  console.log(colorize(`📁 Found 发现 ${inputPaths.length} images 张图片\n`, 'cyan'))

  const rl = createInterface()

  // Show summary
  console.log(colorize('📋 Operation Summary 操作摘要:', 'bright'))
  console.log(`   Output file 输出文件: ${outputPath}`)
  console.log(`   Page size 页面尺寸: ${args.pageSize || 'A4'} (${pageSize[0]} x ${pageSize[1]} pt)`)
  console.log(`   Layout 布局模式: ${layout}`)
  console.log(`   Margin 边距: ${margin} pt`)
  console.log(`   Gap 图片间距: ${gap} pt`)
  console.log(`   JPEG quality JPEG质量: ${quality}%`)

  // Confirm if not --yes
  let confirmed = args.yes
  if (!confirmed) {
    const answer = await question(rl, colorize('\n⚠️  Confirm generate PDF? 确认生成PDF? (y/N): ', 'yellow'))
    confirmed = answer.toLowerCase() === 'y'
  }
  rl.close()

  if (!confirmed) {
    console.log(colorize('Cancelled 已取消', 'gray'))
    process.exit(0)
  }

  // Create PDF
  console.log(colorize('\n🖼️  Processing 处理中...\n', 'bright'))

  const doc = new PDFDocument({
    size: pageSize,
    margin: margin,
    autoFirstPage: false,
  })

  const writeStream = fs.createWriteStream(outputPath)
  doc.pipe(writeStream)

  let successCount = 0
  let failCount = 0
  const failures: string[] = []

  for (let i = 0; i < inputPaths.length; i++) {
    const imagePath = inputPaths[i]
    const filename = path.basename(imagePath)

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} Processing 处理 [${i + 1}/${inputPaths.length}] ${filename} ... `
    )

    try {
      const dimensions = await getImageDimensions(imagePath)

      // Calculate page dimensions (accounting for margin)
      const pageWidth = pageSize[0] - margin * 2
      const pageHeight = pageSize[1] - margin * 2

      // Determine image orientation and layout
      let imgWidth = dimensions.width
      let imgHeight = dimensions.height

      if (layout === 'auto') {
        // Use image's natural orientation
        const isLandscape = dimensions.width > dimensions.height
        if (isLandscape) {
          // Scale to fit width
          const ratio = pageWidth / imgWidth
          imgWidth = pageWidth
          imgHeight = imgHeight * ratio
          if (imgHeight > pageHeight) {
            const ratioH = pageHeight / imgHeight
            imgHeight = pageHeight
            imgWidth = imgWidth * ratioH
          }
        } else {
          // Portrait - scale to fit height
          const ratio = pageHeight / imgHeight
          imgHeight = pageHeight
          imgWidth = imgWidth * ratio
          if (imgWidth > pageWidth) {
            const ratioW = pageWidth / imgWidth
            imgWidth = pageWidth
            imgHeight = imgHeight * ratioW
          }
        }
      } else if (layout === 'landscape') {
        // Force landscape - fit entire image within page
        const ratioW = pageWidth / imgWidth
        const ratioH = pageHeight / imgHeight
        const ratio = Math.min(ratioW, ratioH)
        imgWidth = imgWidth * ratio
        imgHeight = imgHeight * ratio
      } else {
        // Portrait - fit within page
        const ratioW = pageWidth / imgWidth
        const ratioH = pageHeight / imgHeight
        const ratio = Math.min(ratioW, ratioH)
        imgWidth = imgWidth * ratio
        imgHeight = imgHeight * ratio
      }

      // Center image on page
      const x = margin + (pageWidth - imgWidth) / 2
      const y = margin + (pageHeight - imgHeight) / 2

      // Add new page
      doc.addPage()

      // Embed image
      const imageBuffer = await processImageToBuffer(imagePath, { quality })
      doc.image(imageBuffer, x, y, {
        width: imgWidth,
        height: imgHeight,
        fit: [imgWidth, imgHeight],
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

  // Finalize PDF
  doc.end()

  // Wait for write stream to finish
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })

  // Summary
  console.log(colorize('\n' + '='.repeat(50), 'gray'))
  console.log(colorize('✅ PDF generated PDF生成完成!', 'bright'))
  console.log(`   Success 成功: ${colorize(successCount, 'green')} images 张`)
  console.log(`   Failed 失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')} images 张`)
  console.log(`   Output 输出: ${colorize(outputPath, 'cyan')}`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ Failed files 失败列表:', 'red'))
    failures.forEach(f => console.log(`   - ${f}`))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main()
