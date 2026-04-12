# CLI 工具集

[English](./README.md)

常用的图片和视频处理 CLI 工具集合。

## 工具索引

快速跳转到任意工具：

### 图片工具
- [crop-images](#图片批量裁剪-crop-images) - 批量裁剪图片为指定宽高比
- [add-watermark](#图片水印-add-watermark) - 为图片添加文字或图片水印
- [remove-watermark](#图片去水印-remove-watermark) - 移除或淡化图片中的水印

### 视频工具
- [video-convert](#视频批量转换-video-convert) - 转换视频格式
- [video-transcribe](#视频文字提取-video-transcribe) - 从视频中提取文字/字幕
- [video-dedup](#视频去重-video-dedup) - 移除视频中的冗余帧

## 安装

```bash
npm install
```

### 额外依赖

部分工具需要外部依赖：

| 工具 | 依赖 | 安装方式 |
|------|------|----------|
| video-convert | ffmpeg | `brew install ffmpeg` (macOS) / `sudo apt install ffmpeg` (Ubuntu) |
| video-transcribe | faster-whisper | `pip install faster-whisper` |
| video-dedup | ffmpeg | 同上 |

---

## 图片批量裁剪 (crop-images)

批量裁剪目录中的图片为指定宽高比，采用中心裁剪方式。

### 使用方法

```bash
tsx image/crop-images.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `-r, --ratio <比例>` | 裁剪比例 (如 16:9, 4:3, 1:1) | 16:9 |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-w, --max-width <像素>` | 最大裁剪宽度 (如 1920) | - |
| `-H, --max-height <像素>` | 最大裁剪高度 (如 1080) | - |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 交互式使用
tsx image/crop-images.ts -i ./images

# 跳过确认，使用默认值
tsx image/crop-images.ts -i ./images --yes

# 指定比例和输出目录（目录已存在时自动递增）
tsx image/crop-images.ts -i ./image/demo -r 16:9 -m new-dir -o ./image/cropped

# 转为 webp 格式
tsx image/crop-images.ts -i ./images -f webp -q 90

# 限制最大尺寸裁剪
tsx image/crop-images.ts -i ./images -r 16:9 -w 1920 -H 1080
```

### 说明

- 使用 `new-dir` 模式时，如果输出目录已存在，会自动递增命名（如 `cropped-1`、`cropped-2`）
- 最大宽高会在裁剪前先缩放图片，同时保持原始宽高比
- 支持格式: jpg, jpeg, png, webp, gif, avif, tiff

---

## 图片水印 (add-watermark)

为图片添加文字或图片水印。

### 使用方法

```bash
tsx image/add-watermark.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `-t, --text <文字>` | 文字水印内容 | - |
| `-m, --image <路径>` | 图片水印文件路径 | - |
| `-p, --position <位置>` | 位置: north-west, north, north-east, west, center, east, south-west, south, south-east, tile | south-east |
| `-o, --opacity <0-1>` | 透明度 0-1 | 0.5 |
| `-s, --font-size <大小>` | 文字水印字体大小（像素） | 48 |
| `-c, --color <颜色>` | 文字颜色 | white |
| `-M, --margin <像素>` | 边缘边距 | 20 |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-d, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-O, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 文字水印
tsx image/add-watermark.ts -i ./images -t "版权所有 2024"

# 图片水印，自定义位置和透明度
tsx image/add-watermark.ts -i ./images -m logo.png -p center -o 0.3

# 平铺水印效果
tsx image/add-watermark.ts -i ./images -t "样本" -p tile -o 0.2

# 输出到新目录
tsx image/add-watermark.ts -i ./images -t "演示" -f png -d new-dir -O ./images/watermarked
```

### 说明

- 文字水印和图片水印互斥，不能同时使用
- tile 位置会在整个图片上重复水印
- 如果图片水印大于原图的 50%，会自动缩小

---

## 图片去水印 (remove-watermark)

使用基于检测的算法移除或淡化图片中的半透明水印。

### 使用方法

```bash
tsx image/remove-watermark.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `-r, --region <区域>` | 目标区域: all, top, bottom, left, right, corner | all |
| `-t, --threshold <0-1>` | 水印检测的 Alpha 阈值 | 0.1 |
| `-s, --strength <0-1>` | 去除强度 | 0.7 |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 使用默认设置处理整张图片
tsx image/remove-watermark.ts -i ./images

# 针对底部区域，使用较高强度
tsx image/remove-watermark.ts -i ./images --region bottom --strength 0.8

# 针对四角区域，自定义阈值
tsx image/remove-watermark.ts -i ./images -r corner -t 0.15

# 输出到新目录
tsx image/remove-watermark.ts -i ./images -m new-dir -o ./images/cleaned
```

### 说明

- 对半透明水印效果最佳
- 效果因水印类型和图片复杂程度而异
- 强度越高可能会影响图片质量
- **建议：处理前先备份原图**

---

## 视频批量转换 (video-convert)

使用 ffmpeg 转换视频文件格式。

### 使用方法

```bash
tsx video/video-convert.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 视频源目录 | 必填 |
| `-f, --format <格式>` | 输出格式: mp4, webm, avi, mkv, mov, gif | mp4 |
| `-c, --codec <编码器>` | 视频编码: h264, h265, vp9, av1 | h264 (mp4 默认) |
| `-q, --quality <数字>` | CRF 质量 18-28（越低质量越好） | 23 |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 交互式模式
tsx video/video-convert.ts -i ./videos

# 转换为高质量 MP4
tsx video/video-convert.ts -i ./videos -f mp4 -q 18 --yes

# 转换为 WebM 格式
tsx video/video-convert.ts -i ./videos -f webm -m new-dir -o ./videos/converted

# 转换为 GIF
tsx video/video-convert.ts -i ./videos -f gif -q 90
```

### 说明

- 需要安装 ffmpeg
- GIF 转换使用调色板生成以获得更好的质量
- CRF 18 = 高质量，CRF 23 = 中等，CRF 28 = 小文件
- 支持输入格式: mp4, avi, mkv, mov, webm, wmv, flv, m4v, mpg, mpeg

---

## 视频文字提取 (video-transcribe)

使用 faster-whisper (Whisper AI) 从视频文件中提取文字/字幕。

### 使用方法

```bash
tsx video/video-transcribe.ts --input <文件|目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <路径>` | 视频文件或包含视频文件的目录 | 必填 |
| `-o, --output <目录>` | 输出目录 | 与输入相同 |
| `--format <格式>` | 输出格式: srt, txt, vtt, json | srt |
| `-l, --language <语言>` | 语言代码 (如 zh, en, ja) | 自动检测 |
| `--size <大小>` | 模型大小: tiny, base, small, medium, large-v3 | medium |
| `--device <设备>` | 设备: cpu, cuda | cuda (如果可用) |
| `-w, --word-timestamps` | 包含词级时间戳 | false |
| `-m, --filter-music` | 转录前过滤音乐 | false |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 基本转录（生成 .srt 文件）
tsx video/video-transcribe.ts -i video.mp4

# 提取为纯文本，指定语言
tsx video/video-transcribe.ts -i video.mp4 --format txt --language zh

# 批量处理目录
tsx video/video-transcribe.ts -i videos/ --format srt

# WebVTT 格式（用于网页）
tsx video/video-transcribe.ts -i video.mp4 -o subtitles/ --format vtt

# 包含词级时间戳
tsx video/video-transcribe.ts -i video.mp4 --word-timestamps

# 转录前过滤音乐
tsx video/video-transcribe.ts -i video.mp4 --filter-music

# 使用大模型以获得更高准确度
tsx video/video-transcribe.ts -i video.mp4 --size large-v3
```

### 说明

- 需要 Python 和 faster-whisper: `pip install faster-whisper`
- Apple Silicon Mac 上会自动使用 lightning-whisper-mlx（如可用）: `pip3 install lightning-whisper-mlx`
- 支持 CUDA 加速（如有 NVIDIA GPU）
- 支持输入格式: mp4, avi, mkv, mov, webm, wmv, flv, m4v, mpg, mpeg

---

## 视频去重 (video-dedup)

使用 ffmpeg mpdecimate 滤镜移除视频中的冗余帧（重复/相似连续帧）。

### 使用方法

```bash
tsx video/video-dedup.ts --input <文件|目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <路径>` | 源视频文件或目录 | 必填 |
| `-o, --output <路径>` | 输出路径 | input_dedup |
| `-y, --yes` | 跳过确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 单文件处理
tsx video/video-dedup.ts -i input.mp4

# 自定义输出路径
tsx video/video-dedup.ts -i input.mp4 -o output_dedup.mp4

# 批量处理目录
tsx video/video-dedup.ts -i ./videos --yes
```

### 说明

- 使用 ffmpeg mpdecimate 滤镜，采用保守设置 (hi=768:lo=640:frac=0.1)
- 只移除真正冗余的帧，保留场景切换
- 音频直接复制不重新编码
- 输出使用 H.264 重新编码以保证一致性

---

## 开发

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

---

## 支持的文件格式

### 图片格式

| 格式 | 扩展名 | 备注 |
|------|--------|------|
| JPEG | .jpg, .jpeg | |
| PNG | .png | |
| WebP | .webp | |
| GIF | .gif | |
| AVIF | .avif | |
| TIFF | .tiff | |

### 视频格式

| 格式 | 扩展名 | 备注 |
|------|--------|------|
| MP4 | .mp4 | |
| WebM | .webm | |
| AVI | .avi | |
| Matroska | .mkv | |
| QuickTime | .mov | |
| Windows Media | .wmv | |
| Flash Video | .flv | |
| MPEG | .mpg, .mpeg | |
| M4V | .m4v | |
| GIF | .gif | 仅作为输出格式 |
