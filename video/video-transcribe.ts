#!/usr/bin/env tsx

/**
 * Video Transcription Tool
 *
 * Extract text from video files using faster-whisper (Python)
 * Requires: pip install faster-whisper
 * Usage: tsx video/video-transcribe.ts --input <file|directory> [options]
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { colorize, createInterface, question } from "../src/utils/index.js";

const execAsync = promisify(exec);

// CLI argument types
interface CliArgs {
  input?: string;
  output?: string;
  format?: "srt" | "txt" | "vtt" | "json";
  language?: string;
  model?: string;
  size?: "tiny" | "base" | "small" | "medium" | "large-v3";
  device?: "cpu" | "cuda";
  wordTimestamps?: boolean;
  filterMusic?: boolean;
  yes?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" || arg === "-i") result.input = args[++i];
    else if (arg === "--output" || arg === "-o") result.output = args[++i];
    else if (arg === "--format") result.format = args[++i] as CliArgs["format"];
    else if (arg === "--language" || arg === "-l") result.language = args[++i];
    else if (arg === "--model") result.model = args[++i];
    else if (arg === "--size") result.size = args[++i] as CliArgs["size"];
    else if (arg === "--device") result.device = args[++i] as CliArgs["device"];
    else if (arg === "--word-timestamps" || arg === "-w")
      result.wordTimestamps = true;
    else if (arg === "--filter-music" || arg === "-m")
      result.filterMusic = true;
    else if (arg === "--yes" || arg === "-y") result.yes = true;
    else if (arg === "--help" || arg === "-H") result.help = true;
  }
  return result;
}

function showHelp(): void {
  console.log(`
🎬 视频文字提取工具

Usage: tsx video/video-transcribe.ts --input <file|directory> [options]

Required:
  --input, -i <path>         Video file or directory containing video files

Options:
  --output, -o <directory>   Output directory (default: same as input)
  --format <format>          Output format: srt, txt, vtt, json (default: srt)
  --language, -l <lang>      Language code (e.g., zh, en, ja) (auto-detect if not set)
  --size <size>             Model size: tiny, base, small, medium, large-v3 (default: medium)
  --device <device>          Device: cpu, cuda (default: cuda if available)
  --word-timestamps, -w     Include word-level timestamps
  --filter-music, -m        Filter out music from audio before transcription
  --yes, -y                  Skip all prompts, use defaults
  --help, -H                 Show this help message

Examples:
  tsx video/video-transcribe.ts -i video.mp4
  tsx video/video-transcribe.ts -i video.mp4 --format txt --language zh
  tsx video/video-transcribe.ts -i videos/ --format srt --word-timestamps
  tsx video/video-transcribe.ts -i video.mp4 -o subtitles/ --format vtt
  tsx video/video-transcribe.ts -i video.mp4 --filter-music

Note:
  On Apple Silicon Mac, lightning-whisper-mlx will be used automatically if available.
  Install with: pip3 install lightning-whisper-mlx
  Otherwise, install: pip3 install faster-whisper
`);
}

// Supported video extensions
const SUPPORTED_EXTENSIONS = [
  ".mp4",
  ".avi",
  ".mkv",
  ".mov",
  ".webm",
  ".wmv",
  ".flv",
  ".m4v",
  ".mpg",
  ".mpeg",
];

function getVideoFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.error(colorize(`❌ Directory not found 目录不存在: ${dir}`, 'red'))
    process.exit(1);
  }

  // If it's a file, return it directly
  if (fs.statSync(dir).isFile()) {
    const ext = path.extname(dir).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.error(colorize(`❌ Unsupported video format 不支持的视频格式: ${ext}`, 'red'))
      process.exit(1);
    }
    return [dir];
  }

  // It's a directory
  const files = fs.readdirSync(dir);
  const videos = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  if (videos.length === 0) {
    console.error(
      colorize(`❌ No supported videos found in directory 未找到支持的视频格式: ${dir}`, 'yellow'),
    )
    process.exit(1);
  }

  return videos.map((f) => path.join(dir, f));
}

async function checkFfmpeg(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

async function checkCuda(): Promise<boolean> {
  try {
    await execAsync("nvidia-smi --version");
    return true;
  } catch {
    return false;
  }
}

async function checkPythonFasterWhisper(): Promise<boolean> {
  try {
    await execAsync('python3 -c "from faster_whisper import WhisperModel"');
    return true;
  } catch {
    return false;
  }
}

async function installPythonDependencies(): Promise<void> {
  console.log(colorize("📦 Installing Python dependencies automatically正在自动安装 Python 依赖...", 'yellow'))

  // Check if pip is available
  try {
    await execAsync("python3 -m pip --version");
  } catch {
    console.error(colorize('❌ pip not found, please install Python pip first 未找到 pip，请先安装 Python pip', 'red'))
    process.exit(1);
  }

  // Install faster-whisper
  const hasFasterWhisper = await checkPythonFasterWhisper();
  if (!hasFasterWhisper) {
    console.log(colorize("   安装 faster-whisper...", "gray"));
    try {
      await execAsync('python3 -m pip install faster-whisper -q');
      console.log(colorize("   ✅ faster-whisper 安装完成", "green"));
    } catch (err) {
      console.error(colorize('❌ faster-whisper installation failed faster-whisper 安装失败', 'red'))
      throw err;
    }
  }
}

async function checkLightningWhisperMLX(): Promise<boolean> {
  try {
    await execAsync(
      'python3 -c "from lightning_whisper_mlx import LightningWhisperMLX"',
    );
    return true;
  } catch {
    return false;
  }
}

// Filter music from audio using FFmpeg
async function filterMusicFromAudio(videoPath: string): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join("/tmp", "video-transcribe-audio-"));
  const outputPath = path.join(tempDir, "audio.m4a");

  // FFmpeg filter to extract voice: highpass + lowpass
  // highpass: remove frequencies below 80Hz (bass, rumble)
  // lowpass: remove frequencies above 250Hz (music harmonics, harsh sounds)
  // Human voice typically ranges from 85Hz to 255Hz
  const filter = "highpass=f=80,lowpass=f=250";

  const cmd = `ffmpeg -y -i "${videoPath}" -af "${filter}" -c:a aac -b:a 128k "${outputPath}"`;

  try {
    await execAsync(cmd);
  } catch (err) {
    fs.rmdirSync(tempDir, { recursive: true });
    throw err;
  }

  return outputPath;
}

// Clean up temp audio directory
function cleanupTempAudio(tempPath: string): void {
  try {
    const tempDir = path.dirname(tempPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

// Convert seconds to SRT time format
function secondsToSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${millis.toString().padStart(3, "0")}`;
}

// Convert seconds to VTT time format
function secondsToVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

// Generate SRT content from segments
function generateSrt(
  segments: Array<{ start: number; end: number; text: string }>,
  _wordTimestamps: boolean,
): string {
  let srt = "";
  let index = 1;

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;

    srt += `${index}\n`;
    srt += `${secondsToSrtTime(segment.start)} --> ${secondsToSrtTime(segment.end)}\n`;
    srt += `${text}\n\n`;
    index++;
  }

  return srt;
}

// Generate VTT content from segments
function generateVtt(
  segments: Array<{ start: number; end: number; text: string }>,
  _wordTimestamps: boolean,
): string {
  let vtt = "WEBVTT\n\n";

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;

    vtt += `${secondsToVttTime(segment.start)} --> ${secondsToVttTime(segment.end)}\n`;
    vtt += `${text}\n\n`;
  }

  return vtt;
}

// Generate JSON content from segments
function generateJson(
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{ start: number; end: number; word: string }>;
  }>,
  info: { language: string; languageProbability: number; duration: number },
): string {
  return JSON.stringify(
    {
      language: info.language,
      languageProbability: info.languageProbability,
      duration: info.duration,
      segments: segments.map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        words: s.words?.map((w) => ({
          start: w.start,
          end: w.end,
          word: w.word,
        })),
      })),
    },
    null,
    2,
  );
}

// Generate plain text from segments
function generateTxt(segments: Array<{ text: string }>): string {
  return segments
    .map((s) => s.text.trim())
    .filter((t) => t)
    .join("\n\n");
}

// Transcribe using Python faster-whisper or lightning-whisper-mlx
async function transcribeVideo(
  videoPath: string,
  options: {
    language?: string;
    model?: string;
    device?: "cpu" | "cuda";
    wordTimestamps?: boolean;
    useMlx?: boolean;
  },
): Promise<{
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{ start: number; end: number; word: string }>;
  }>;
  info: { language: string; languageProbability: number; duration: number };
}> {
  const modelSize = options.model || "large-v3";
  const useMlx = options.useMlx || false;
  const wordTimestamps = options.wordTimestamps || false;

  console.log(
    colorize(
      `   📥 加载模型: ${modelSize} (${useMlx ? "MLX (Apple Silicon)" : "CPU"})`,
      "gray",
    ),
  );

  // Write Python script to temp file to avoid quoting issues
  const tempDir = fs.mkdtempSync(path.join("/tmp", "video-transcribe-"));
  const scriptPath = path.join(tempDir, "transcribe.py");

  let pythonScript: string;

  if (useMlx) {
    pythonScript = `from lightning_whisper_mlx import LightningWhisperMLX
import json

model_size = "${modelSize}"

whisper = LightningWhisperMLX(model=model_size, batch_size=12, quant=None)

transcribe_options = {}
${options.language ? `transcribe_options["language"] = "${options.language}"` : ""}

result = whisper.transcribe(audio_path="${videoPath.replace(/\\/g, "\\\\")}", **transcribe_options)

output = {
    "info": {
        "language": result.get("language", "unknown"),
        "languageProbability": 1.0,
        "duration": 0.0
    },
    "segments": []
}

segments = result.get("segments", [])
if isinstance(segments, list):
    for seg in segments:
        if isinstance(seg, dict):
            output["segments"].append({
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": seg.get("text", "")
            })
        elif hasattr(seg, "start"):
            output["segments"].append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text
            })
        elif isinstance(seg, (list, tuple)) and len(seg) >= 3:
            output["segments"].append({
                "start": seg[0],
                "end": seg[1],
                "text": seg[2]
            })

print(json.dumps(output))
`;
  } else {
    const device = options.device || "cpu";
    const computeType = device === "cuda" ? "float16" : "int8";

    pythonScript = `from faster_whisper import WhisperModel
import sys
import json

model_size = "${modelSize}"
device = "${device}"
compute_type = "${computeType}"

model = WhisperModel(model_size, device=device, compute_type=compute_type)

transcribe_options = {
    "beam_size": 5,
    "word_timestamps": ${wordTimestamps ? "True" : "False"}
}
${options.language ? `transcribe_options["language"] = "${options.language}"` : ""}

segments, info = model.transcribe("${videoPath.replace(/\\/g, "\\\\")}", **transcribe_options)

result = {
    "info": {
        "language": info.language,
        "languageProbability": info.language_probability,
        "duration": info.duration
    },
    "segments": []
}

for segment in segments:
    seg_data = {
        "start": segment.start,
        "end": segment.end,
        "text": segment.text
    }
    if ${wordTimestamps ? "True" : "False"} and hasattr(segment, 'words') and segment.words:
        seg_data["words"] = [
            {"start": w.start, "end": w.end, "word": w.word}
            for w in segment.words
        ]
    result["segments"].append(seg_data)

print(json.dumps(result))
`;
  }

  fs.writeFileSync(scriptPath, pythonScript, "utf-8");

  try {
    const { stdout } = await execAsync(`python3 "${scriptPath}"`);
    const result = JSON.parse(stdout);

    return {
      segments: result.segments,
      info: result.info,
    };
  } finally {
    // Clean up temp file
    fs.unlinkSync(scriptPath);
    fs.rmdirSync(tempDir);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.input) {
    console.error(colorize('❌ Please specify input file or directory 请指定输入文件或目录: --input <path>', 'red'))
    console.log(colorize('   Use --help for more info 使用 --help 查看帮助', 'gray'))
    process.exit(1);
  }

  // Check ffmpeg availability
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    console.error(colorize('❌ ffmpeg not found, please install ffmpeg first 未找到 ffmpeg，请先安装 ffmpeg', 'red'))
    console.log(colorize('   Installation 安装方式:', 'gray'))
    console.log(colorize('   macOS: brew install ffmpeg', 'gray'))
    console.log(colorize('   Ubuntu/Debian: sudo apt install ffmpeg', 'gray'))
    console.log(colorize('   Windows: winget install ffmpeg', 'gray'))
    process.exit(1);
  }

  // Check faster-whisper installation
  const hasWhisper = await checkPythonFasterWhisper();
  const hasMlxWhisper = await checkLightningWhisperMLX();

  // Determine which whisper backend to use (prefer faster-whisper)
  let useMlx = false;
  if (!hasWhisper && hasMlxWhisper) {
    // fallback to lightning-whisper-mlx if faster-whisper not available
    useMlx = true;
    console.log(
      colorize("⚠️  faster-whisper not installed, using lightning-whisper-mlx 未安装 faster-whisper，使用 lightning-whisper-mlx", "yellow"),
    );
  } else if (!hasWhisper && !hasMlxWhisper) {
    // Auto-install dependencies
    await installPythonDependencies();
    // Re-check after installation
    const hasWhisperAfterInstall = await checkPythonFasterWhisper();
    if (!hasWhisperAfterInstall) {
      console.error(
        colorize('❌ faster-whisper installation failed, please install manually faster-whisper 安装失败，请手动安装', 'red'),
      );
      process.exit(1);
    }
    console.log(
      colorize("✅ faster-whisper installed successfully, continuing 已安装成功，继续中...", "green"),
    );
  }

  // Check CUDA availability
  const hasCuda = await checkCuda();
  const device = args.device || (hasCuda ? "cuda" : "cpu");

  const inputPath = path.resolve(args.input);
  const videoFiles = getVideoFiles(inputPath);

  console.log(colorize("\n🎬 视频文字提取工具", "bright"));
  console.log(colorize("=".repeat(50), "gray"));
  console.log(colorize(`📁 输入路径: ${inputPath}`, "cyan"));
  console.log(colorize(`🖼️  发现 ${videoFiles.length} 个视频文件`, "cyan"));
  console.log(colorize(`⚡ 设备: ${device}`, "cyan"));

  const rl = createInterface();

  // Gather parameters
  const format = args.format || "srt";
  const language = args.language;
  const modelSize = args.size || "medium";
  const wordTimestamps = args.wordTimestamps || false;
  const filterMusic = args.filterMusic || false;

  // Determine output directory
  let outputDir: string;
  if (args.output) {
    outputDir = path.resolve(args.output);
  } else if (videoFiles.length === 1) {
    outputDir = path.dirname(videoFiles[0]);
  } else {
    outputDir = inputPath;
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Show summary
  console.log(colorize("\n📋 操作摘要:", "bright"));
  console.log(`   输出目录: ${outputDir}`);
  console.log(`   输出格式: ${format.toUpperCase()}`);
  console.log(`   语言: ${language || "自动检测"}`);
  console.log(`   模型: ${modelSize}`);
  console.log(`   词级时间戳: ${wordTimestamps ? "是" : "否"}`);
  console.log(`   过滤音乐: ${filterMusic ? "是" : "否"}`);
  console.log(`   视频数量: ${videoFiles.length} 个`);

  // Confirm if not --yes
  let confirmed = args.yes;
  if (!confirmed) {
    const answer = await question(
      rl,
      colorize("\n⚠️  确认开始转录? (y/N): ", "yellow"),
    );
    confirmed = answer.toLowerCase() === "y";
  }
  rl.close();

  if (!confirmed) {
    console.log(colorize("已取消", "gray"));
    process.exit(0);
  }

  // Process videos
  console.log(colorize("\n🎬 开始处理...\n", "bright"));

  let successCount = 0;
  let failCount = 0;
  const failures: string[] = [];

  for (let i = 0; i < videoFiles.length; i++) {
    const videoPath = videoFiles[i];
    const filename = path.basename(videoPath);
    const baseName = path.basename(filename, path.extname(filename));

    const outputExt =
      format === "json"
        ? "json"
        : format === "vtt"
          ? "vtt"
          : format === "txt"
            ? "txt"
            : "srt";
    const outputPath = path.join(outputDir, `${baseName}.${outputExt}`);

    process.stdout.write(
      `   ${colorize("▶", "cyan")} 转录 [${i + 1}/${videoFiles.length}] ${filename} ... `,
    );

    try {
      // Filter music if requested
      let audioPath = videoPath;
      let tempAudioPath: string | undefined;
      if (filterMusic) {
        process.stdout.write(colorize("🎵 过滤音乐... ", "gray"));
        tempAudioPath = await filterMusicFromAudio(videoPath);
        audioPath = tempAudioPath;
        process.stdout.write(colorize("✅\n", "green"));
      }

      const { segments, info } = await transcribeVideo(audioPath, {
        language,
        model: modelSize,
        device: device as "cpu" | "cuda",
        wordTimestamps,
        useMlx,
      });

      // Clean up temp audio
      if (tempAudioPath) {
        cleanupTempAudio(tempAudioPath);
      }

      let content: string;
      switch (format) {
        case "srt":
          content = generateSrt(segments, wordTimestamps);
          break;
        case "vtt":
          content = generateVtt(segments, wordTimestamps);
          break;
        case "json":
          content = generateJson(segments, info);
          break;
        case "txt":
        default:
          content = generateTxt(segments);
          break;
      }

      fs.writeFileSync(outputPath, content, "utf-8");

      console.log(colorize("✅", "green"));
      console.log(
        colorize(
          `      Language 语言: ${info.language} (${(info.languageProbability * 100).toFixed(1)}%)`,
          'gray',
        ),
      );
      console.log(colorize(`      Duration 时长: ${info.duration.toFixed(1)}s`, 'gray'));
      console.log(colorize(`      Segments 片段: ${segments.length}`, 'gray'));
      console.log(colorize(`      Output 输出: ${outputPath}`, 'gray'));
      successCount++;
    } catch (err) {
      console.log(colorize("❌", "red"));
      failCount++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${filename}: ${msg}`);
    }
  }

  // Summary
  console.log(colorize("\n" + "=".repeat(50), "gray"));
  console.log(colorize("✅ 处理完成!", "bright"));
  console.log(`   成功: ${colorize(successCount, "green")} 个`);
  console.log(
    `   失败: ${colorize(failCount, failCount > 0 ? "red" : "green")} 个`,
  );

  if (failures.length > 0) {
    console.log(colorize("\n❌ 失败列表:", "red"));
    failures.forEach((f) => console.log(`   - ${f}`));
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main();
