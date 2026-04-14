#!/usr/bin/env tsx

/**
 * Remove Background Tool
 *
 * Remove background from images using rembg (Python)
 * Requires: pip install rembg pillow
 * Usage: tsx image/remove-bg.ts --input <file|directory> [options]
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { colorize, getImageFiles } from '../src/utils/index.js'

const execAsync = promisify(exec)

// CLI argument types
interface CliArgs {
  input?: string
  output?: string
  model?: string
  noSession?: boolean
  help?: boolean
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' || arg === '-i') result.input = args[++i]
    else if (arg === '--output' || arg === '-o') result.output = args[++i]
    else if (arg === '--model') result.model = args[++i]
    else if (arg === '--no-session') result.noSession = true
    else if (arg === '--help' || arg === '-H') result.help = true
  }
  return result
}

function showHelp(): void {
  console.log(`
🖼️  Remove Background Tool

Usage: tsx image/remove-bg.ts --input <file|directory> [options]

Required:
  --input, -i <path>    Input image file or directory
  --output, -o <path>   Output file or directory

Options:
  --model <name>        Model name (default: u2net)
                        Options: u2net, u2netp, u2net_human_seg, bria.rmbg
  --no-session         Create new session per image (slower)
  --help, -H           Show this help message

Examples:
  tsx image/remove-bg.ts -i photo.jpg -o photo_transparent.png
  tsx image/remove-bg.ts -i ./photos -o ./output
  tsx image/remove-bg.ts -i photo.jpg -o photo.png --model bria.rmbg
`)
}

async function checkRembg(): Promise<boolean> {
  try {
    await execAsync('python3 -c "from rembg import remove"')
    return true
  } catch {
    return false
  }
}

async function installDependencies(): Promise<void> {
  console.log(colorize('📦 Installing Python dependencies automatically正在自动安装 Python 依赖...', 'yellow'))

  // Check if pip is available
  try {
    await execAsync('python3 -m pip --version')
  } catch {
    console.error(colorize('❌ pip not found, please install Python pip first 未找到 pip，请先安装 Python pip', 'red'))
    process.exit(1)
  }

  const hasRembg = await checkRembg()
  if (!hasRembg) {
    console.log(colorize('   安装 rembg pillow...', 'gray'))
    try {
      await execAsync('python3 -m pip install rembg pillow -q')
      console.log(colorize('   ✅ rembg 安装完成', 'green'))
    } catch (err) {
      console.error(colorize('❌ rembg installation failed rembg 安装失败', 'red'))
      throw err
    }
  }
}

async function removeBackground(
  inputPath: string,
  outputPath: string,
  model: string,
  sessionFlag: string,
): Promise<void> {
  // Write Python script to temp file to avoid quoting issues
  const tempDir = fs.mkdtempSync(path.join('/tmp', 'remove-bg-'))
  const scriptPath = path.join(tempDir, 'remove_bg.py')

  const pythonScript = `from rembg import remove, new_session
import sys

input_path = "${inputPath.replace(/\\/g, '\\\\')}"
output_path = "${outputPath.replace(/\\/g, '\\\\')}"
model_name = "${model}"
reuse_session = ${sessionFlag === 'true' ? 'False' : 'True'}

session = None if not reuse_session else new_session(model_name=model_name)

with open(input_path, "rb") as i:
    with open(output_path, "wb") as o:
        input_data = i.read()
        output_data = remove(input_data, session=session)
        o.write(output_data)

print("OK")
`

  fs.writeFileSync(scriptPath, pythonScript, 'utf-8')

  try {
    await execAsync(`python3 "${scriptPath}"`)
  } finally {
    // Clean up temp file
    fs.unlinkSync(scriptPath)
    fs.rmdirSync(tempDir)
  }
}

async function batchProcess(
  inputDir: string,
  outputDir: string,
  model: string,
  noSession: boolean,
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const files = getImageFiles(inputDir)
  console.log(colorize(`   Found 发现 ${files.length} images to process 张图片待处理`, 'cyan'))

  let successCount = 0
  let failCount = 0
  const failures: string[] = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const fileName = path.basename(filePath)
    const stem = path.basename(fileName, path.extname(fileName))
    const outFilePath = path.join(outputDir, `${stem}.png`)

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} [${i + 1}/${files.length}] ${fileName} -> ${stem}.png ... `,
    )

    try {
      await removeBackground(filePath, outFilePath, model, noSession.toString())
      console.log(colorize('✅', 'green'))
      successCount++
    } catch (err) {
      console.log(colorize('❌', 'red'))
      failCount++
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${fileName}: ${msg}`)
    }
  }

  // Summary
  console.log(colorize('\n📋 Processing complete 处理完成!', 'bright'))
  console.log(`   Success 成功: ${colorize(successCount, 'green')} 个`)
  console.log(`   Failed 失败: ${colorize(failCount, failCount > 0 ? 'red' : 'green')} 个`)

  if (failures.length > 0) {
    console.log(colorize('\n❌ Failed files 失败列表:', 'red'))
    failures.forEach((f) => console.log(`   - ${f}`))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate required arguments
  if (!args.input || !args.output) {
    console.error(colorize('❌ Please specify input and output 请指定输入和输出: --input <path> --output <path>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1)
  }

  // Check rembg installation and auto-install if needed
  const hasRembg = await checkRembg()
  if (!hasRembg) {
    await installDependencies()
  }

  const inputPathStr = path.resolve(args.input!)
  const outputPathStr = path.resolve(args.output!)
  const model = args.model || 'u2net'
  const noSession = args.noSession || false

  if (fs.statSync(inputPathStr).isFile()) {
    console.log(colorize('\n🖼️  Remove Background Tool', 'bright'))
    console.log(colorize('='.repeat(50), 'gray'))
    console.log(colorize(`📁 输入: ${inputPathStr}`, 'cyan'))
    console.log(colorize(`📁 输出: ${outputPathStr}`, 'cyan'))
    console.log(colorize(`🔧 模型: ${model}`, 'cyan'))

    console.log(colorize('   Processing... 正在处理...', 'gray'))

    try {
      await removeBackground(inputPathStr, outputPathStr, model, noSession.toString())
      console.log(colorize('✅', 'green'))
      console.log(colorize(`   Saved to 已保存到: ${outputPathStr}`, 'gray'))
    } catch (err) {
      console.log(colorize('❌', 'red'))
      console.error(
        colorize(`   Failed 处理失败: ${err instanceof Error ? err.message : String(err)}`, 'red'),
      )
      process.exit(1)
    }
  } else if (fs.statSync(inputPathStr).isDirectory()) {
    console.log(colorize('\n🖼️  Remove Background Tool', 'bright'))
    console.log(colorize('='.repeat(50), 'gray'))
    console.log(colorize(`📁 输入目录: ${inputPathStr}`, 'cyan'))
    console.log(colorize(`📁 输出目录: ${outputPathStr}`, 'cyan'))
    console.log(colorize(`🔧 模型: ${model}`, 'cyan'))

    await batchProcess(inputPathStr, outputPathStr, model, noSession)
  } else {
    console.error(colorize(`❌ Invalid input path 无效的输入路径: ${args.input}`, 'red'))
    process.exit(1)
  }
}

main()
