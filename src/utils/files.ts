/**
 * File system utilities for CLI tools
 * Shared file/folder handling functions
 */

import fs from 'fs'
import path from 'path'
import { colorize } from './console.js'

// Supported file extensions
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff', '.bmp']
export const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg']

/**
 * Check if file is an image based on extension
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

/**
 * Check if file is a video based on extension
 */
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXTENSIONS.includes(ext)
}

/**
 * Get image files from a path (file or directory)
 */
export function getImageFiles(inputPath: string): string[] {
  if (!fs.existsSync(inputPath)) {
    console.error(colorize(`❌ Path not found 路径不存在: ${inputPath}`, 'red'))
    process.exit(1)
  }

  // If it's a file, return it directly
  if (fs.statSync(inputPath).isFile()) {
    const ext = path.extname(inputPath).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      console.error(colorize(`❌ Unsupported image format 不支持的图片格式: ${ext}`, 'red'))
      process.exit(1)
    }
    return [inputPath]
  }

  // It's a directory
  const files = fs.readdirSync(inputPath)
  const images = files.filter(file => {
    const ext = path.extname(file).toLowerCase()
    return IMAGE_EXTENSIONS.includes(ext)
  })

  if (images.length === 0) {
    console.error(colorize(`❌ No supported images found in 未找到支持的图片格式: ${inputPath}`, 'yellow'))
    console.log(colorize(`   Supported formats 支持的格式: ${IMAGE_EXTENSIONS.join(', ')}`, 'gray'))
    process.exit(1)
  }

  return images.map(f => path.join(inputPath, f))
}

/**
 * Get video files from a path (file or directory)
 */
export function getVideoFiles(inputPath: string): string[] {
  if (!fs.existsSync(inputPath)) {
    console.error(colorize(`❌ Path not found 路径不存在: ${inputPath}`, 'red'))
    process.exit(1)
  }

  // If it's a file, return it directly
  if (fs.statSync(inputPath).isFile()) {
    const ext = path.extname(inputPath).toLowerCase()
    if (!VIDEO_EXTENSIONS.includes(ext)) {
      console.error(colorize(`❌ Unsupported video format 不支持的视频格式: ${ext}`, 'red'))
      console.log(colorize(`   Supported formats 支持的格式: ${VIDEO_EXTENSIONS.join(', ')}`, 'gray'))
      process.exit(1)
    }
    return [inputPath]
  }

  // It's a directory
  const files = fs.readdirSync(inputPath)
  const videos = files.filter(file => {
    const ext = path.extname(file).toLowerCase()
    return VIDEO_EXTENSIONS.includes(ext)
  })

  if (videos.length === 0) {
    console.error(colorize(`❌ No supported videos found in 未找到支持的视频格式: ${inputPath}`, 'yellow'))
    console.log(colorize(`   Supported formats 支持的格式: ${VIDEO_EXTENSIONS.join(', ')}`, 'gray'))
    process.exit(1)
  }

  return videos.map(f => path.join(inputPath, f))
}

/**
 * Ensure directory exists, create with unique name if needed
 * Returns the created/existing directory path
 */
export function ensureUniqueDir(dir: string): string {
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

/**
 * Process files with progress indicator and error handling
 */
export async function processFiles<T>(
  files: string[],
  processor: (file: string, index: number) => Promise<T>,
  options: {
    onSuccess?: (result: T, filename: string) => void
    onError?: (error: Error, filename: string) => void
  } = {}
): Promise<{ successCount: number; failCount: number; failures: string[] }> {
  let successCount = 0
  let failCount = 0
  const failures: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const filename = path.basename(file)

    process.stdout.write(
      `   ${colorize('▶', 'cyan')} Processing 处理 [${i + 1}/${files.length}] ${filename} ... `
    )

    try {
      const result = await processor(file, i)
      console.log(colorize('✅', 'green'))
      successCount++
      options.onSuccess?.(result, filename)
    } catch (err) {
      console.log(colorize('❌', 'red'))
      failCount++
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${filename}: ${msg}`)
      options.onError?.(err instanceof Error ? err : new Error(msg), filename)
    }
  }

  return { successCount, failCount, failures }
}
