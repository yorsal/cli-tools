# CLI 工具集

[English](./README.md)

常用的图片和视频处理 CLI 工具集合。

## 工具索引

快速跳转到任意工具：

### 图片工具
- [crop-images](#图片批量裁剪-crop-images) - 批量裁剪图片为指定宽高比
- [add-watermark](#图片水印-add-watermark) - 为图片添加文字或图片水印
- [remove-watermark](#图片去水印-remove-watermark) - 移除或淡化图片中的水印
- [resize-images](#图片批量缩放-resize-images) - 按尺寸/比例/最长边批量缩放图片
- [adjust-colors](#图片调色-adjust-colors) - 调整亮度、对比度、饱和度并应用滤镜
- [blur-mosaic](#图片模糊马赛克-blur-mosaic) - 对图片应用模糊或马赛克效果
- [rotate-flip](#图片旋转翻转-rotate-flip) - 旋转和翻转图片

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

## 图片批量缩放 (resize-images)

批量缩放图片，支持多种缩放模式。

### 使用方法

```bash
tsx image/resize-images.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `-W, --width <像素>` | 目标宽度 | - |
| `-h, --height <像素>` | 目标高度 | - |
| `-p, --percent <数字>` | 缩放百分比 (50=缩小一半, 200=放大两倍) | - |
| `-l, --longest-edge <像素>` | 最长边缩放到此值 | - |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 按百分比缩放（缩小一半）
tsx image/resize-images.ts -i ./images --percent 50 --yes

# 缩放到精确尺寸
tsx image/resize-images.ts -i ./images -W 800 -h 600 --yes

# 按最长边缩放（最大 1920px）
tsx image/resize-images.ts -i ./images --longest-edge 1920 -m new-dir -o ./images/resized

# 转为 webp 并设置高质量
tsx image/resize-images.ts -i ./images -f webp -q 90 --yes
```

### 说明

- 宽高和百分比模式互斥
- 最长边模式保持宽高比（如 1920x1080，最长边=1280 → 1280x720）
- 小于目标尺寸的图片在最长边模式下保持原样复制

---

## 图片调色 (adjust-colors)

调整亮度、对比度、饱和度，并应用滤镜效果。

### 使用方法

```bash
tsx image/adjust-colors.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `-b, --brightness <数字>` | 亮度 -100 到 100 | 0 |
| `-c, --contrast <数字>` | 对比度 -100 到 100 | 0 |
| `-s, --saturation <数字>` | 饱和度 -100 到 100 | 0 |
| `--grayscale` | 转为灰度 | - |
| `--sepia` | 应用复古色调 | - |
| `--sharpen` | 锐化图片 | - |
| `--blur` | 应用轻度高斯模糊 | - |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 提亮图片
tsx image/adjust-colors.ts -i ./images --brightness 30 --yes

# 增加对比度和饱和度
tsx image/adjust-colors.ts -i ./images -c 20 -s 50 --yes

# 应用灰度滤镜
tsx image/adjust-colors.ts -i ./images --grayscale -m new-dir -o ./images/bw

# 应用复古色调
tsx image/adjust-colors.ts -i ./images --sepia --yes

# 组合调色和滤镜
tsx image/adjust-colors.ts -i ./images -b 10 -c 15 --sharpen -f jpg --yes
```

### 说明

- 调色参数（亮度、对比度、饱和度）和滤镜可以组合使用
- 滤镜在数值调整之后应用
- 负数减少，正数增加

---

## 图片模糊/马赛克 (blur-mosaic)

对图片应用模糊或马赛克效果，支持区域定位。

### 使用方法

```bash
tsx image/blur-mosaic.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `-B, --blur <半径>` | 高斯模糊半径 1-100 | - |
| `-M, --mosaic <大小>` | 马赛克像素大小 2-50 | - |
| `-r, --region <区域>` | 目标区域: all, top, bottom, left, right, corner | all |
| `--rect <x,y,w,h>` | 自定义矩形 (x,y,宽度,高度，单位像素) | - |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 区域预设

| 区域 | 说明 |
|------|------|
| `all` | 整张图片（默认） |
| `top` | 图片顶部 20% |
| `bottom` | 图片底部 20% |
| `left` | 图片左侧 20% |
| `right` | 图片右侧 20% |
| `corner` | 右下角 25% x 25% |

### 示例

```bash
# 模糊整张图片
tsx image/blur-mosaic.ts -i ./images --blur 10 --yes

# 对角落应用马赛克（隐私处理）
tsx image/blur-mosaic.ts -i ./images --mosaic 8 -r corner --yes

# 模糊自定义区域
tsx image/blur-mosaic.ts -i ./images --blur 15 --rect 100,100,200,200 -m new-dir -o ./output

# 对底部区域应用马赛克
tsx image/blur-mosaic.ts -i ./images --mosaic 12 -r bottom --yes
```

### 说明

- 模糊和马赛克互斥（使用 -B 或 -M，不能同时使用）
- 自定义矩形格式: x,y,宽度,高度（单位像素）
- 适用于隐藏敏感信息（车牌、人脸等）

---

## 图片旋转/翻转 (rotate-flip)

旋转和翻转图片，支持多种旋转角度。

### 使用方法

```bash
tsx image/rotate-flip.ts --input <目录> [选项]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <目录>` | 图片源目录 | 必填 |
| `--rotate-90` | 顺时针旋转 90 度 | - |
| `--rotate-180` | 旋转 180 度 | - |
| `--rotate-270` | 顺时针旋转 270 度 | - |
| `--rotate-custom <角度>` | 自定义角度旋转 (0-360) | - |
| `--flip-horizontal` | 沿垂直轴镜像 | - |
| `--flip-vertical` | 沿水平轴镜像 | - |
| `-f, --format <格式>` | 输出格式: jpg, png, webp, keep | keep |
| `-m, --mode <模式>` | 输出模式: overwrite, new-dir | overwrite |
| `-o, --output <目录>` | 输出目录 (mode=new-dir 时必填) | - |
| `-q, --quality <数字>` | 输出质量 1-100 | 85 |
| `-y, --yes` | 跳过所有确认提示 | false |
| `-H, --help` | 显示帮助信息 | - |

### 示例

```bash
# 顺时针旋转 90 度
tsx image/rotate-flip.ts -i ./images --rotate-90 --yes

# 水平翻转（镜像）
tsx image/rotate-flip.ts -i ./images --flip-horizontal --yes

# 旋转 180 度
tsx image/rotate-flip.ts -i ./images --rotate-180 -m new-dir -o ./images/rotated

# 组合旋转和翻转
tsx image/rotate-flip.ts -i ./images --rotate-90 --flip-horizontal --yes

# 自定义角度旋转
tsx image/rotate-flip.ts -i ./images --rotate-custom 45 --yes
```

### 说明

- 旋转和翻转可以组合使用
- 自定义旋转会自动调整画布（不会裁剪）
- 可用于校正方向或创建镜像效果

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
