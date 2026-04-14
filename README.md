# CLI Tools

[中文](./README.zh.md)

A collection of CLI tools for common image and video tasks.

## Tools Index

Jump to any tool quickly:

### Image Tools
- [crop-images](#image-batch-crop-crop-images) - Batch crop images to a specified aspect ratio
- [add-watermark](#image-watermark-add-watermark) - Add text or image watermark to images
- [remove-watermark](#image-watermark-removal-remove-watermark) - Remove or reduce watermark visibility
- [images-to-pdf](#images-to-pdf-images-to-pdf) - Combine multiple images into a single PDF

### Video Tools
- [video-convert](#video-batch-convert-video-convert) - Convert video files to different formats
- [video-transcribe](#video-transcription-video-transcribe) - Extract text/subtitles from videos
- [video-dedup](#video-deduplication-video-dedup) - Remove redundant frames from videos

## Installation

```bash
npm install
```

### Additional Dependencies

Some tools require external dependencies:

| Tool | Dependency | Installation |
|------|------------|--------------|
| video-convert | ffmpeg | `brew install ffmpeg` (macOS) / `sudo apt install ffmpeg` (Ubuntu) |
| video-transcribe | faster-whisper | `pip install faster-whisper` |
| video-dedup | ffmpeg | Same as above |

---

## Image Batch Crop (crop-images)

Crop images in a directory to a specified aspect ratio using center裁剪.

### Usage

```bash
tsx image/crop-images.ts --input <directory> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <directory>` | Source image directory | Required |
| `-r, --ratio <ratio>` | Crop ratio (e.g. 16:9, 4:3, 1:1) | 16:9 |
| `-f, --format <format>` | Output format: jpg, png, webp, keep | keep |
| `-m, --mode <mode>` | Output mode: overwrite, new-dir | overwrite |
| `-o, --output <directory>` | Output directory (required when mode=new-dir) | - |
| `-q, --quality <number>` | Output quality 1-100 | 85 |
| `-w, --max-width <pixels>` | Maximum crop width (e.g. 1920) | - |
| `-H, --max-height <pixels>` | Maximum crop height (e.g. 1080) | - |
| `-y, --yes` | Skip all confirmation prompts | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Interactive mode
tsx image/crop-images.ts -i ./images

# Skip confirmation with defaults
tsx image/crop-images.ts -i ./images --yes

# Specify ratio and output directory (auto-increment if exists)
tsx image/crop-images.ts -i ./image/demo -r 16:9 -m new-dir -o ./image/cropped

# Convert to webp format
tsx image/crop-images.ts -i ./images -f webp -q 90

# Crop with max dimensions
tsx image/crop-images.ts -i ./images -r 16:9 -w 1920 -H 1080
```

### Notes

- When using `new-dir` mode, if the output directory already exists, it will automatically increment (e.g., `cropped-1`, `cropped-2`)
- Max width/height resizes images before cropping while maintaining aspect ratio
- Supported formats: jpg, jpeg, png, webp, gif, avif, tiff

---

## Image Watermark (add-watermark)

Add text or image watermarks to images.

### Usage

```bash
tsx image/add-watermark.ts --input <directory> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <directory>` | Source image directory | Required |
| `-t, --text <text>` | Text watermark | - |
| `-m, --image <path>` | Image watermark file path | - |
| `-p, --position <position>` | Position: north-west, north, north-east, west, center, east, south-west, south, south-east, tile | south-east |
| `-o, --opacity <0-1>` | Opacity 0-1 | 0.5 |
| `-s, --font-size <size>` | Font size in pixels for text watermark | 48 |
| `-c, --color <color>` | Text color | white |
| `-M, --margin <pixels>` | Margin from edge | 20 |
| `-f, --format <format>` | Output format: jpg, png, webp, keep | keep |
| `-d, --mode <mode>` | Output mode: overwrite, new-dir | overwrite |
| `-O, --output <directory>` | Output directory (required when mode=new-dir) | - |
| `-q, --quality <number>` | Output quality 1-100 | 85 |
| `-y, --yes` | Skip all confirmation prompts | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Text watermark
tsx image/add-watermark.ts -i ./images -t "Copyright 2024"

# Image watermark with custom position and opacity
tsx image/add-watermark.ts -i ./images -m logo.png -p center -o 0.3

# Tile watermark effect
tsx image/add-watermark.ts -i ./images -t "SAMPLE" -p tile -o 0.2

# Output to new directory
tsx image/add-watermark.ts -i ./images -t "Demo" -f png -d new-dir -O ./images/watermarked
```

### Notes

- Text and image watermarks are mutually exclusive
- Tile position repeats watermark across the entire image
- Image watermarks are automatically resized if larger than 50% of the base image

---

## Image Watermark Removal (remove-watermark)

Remove or reduce semi-transparent watermarks from images using detection-based algorithms.

### Usage

```bash
tsx image/remove-watermark.ts --input <directory> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <directory>` | Source image directory | Required |
| `-r, --region <region>` | Target region: all, top, bottom, left, right, corner | all |
| `-t, --threshold <0-1>` | Alpha threshold for watermark detection | 0.1 |
| `-s, --strength <0-1>` | Removal strength | 0.7 |
| `-f, --format <format>` | Output format: jpg, png, webp, keep | keep |
| `-m, --mode <mode>` | Output mode: overwrite, new-dir | overwrite |
| `-o, --output <directory>` | Output directory (required when mode=new-dir) | - |
| `-q, --quality <number>` | Output quality 1-100 | 85 |
| `-y, --yes` | Skip all confirmation prompts | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Process entire image with defaults
tsx image/remove-watermark.ts -i ./images

# Target bottom region with higher strength
tsx image/remove-watermark.ts -i ./images --region bottom --strength 0.8

# Target corners with custom threshold
tsx image/remove-watermark.ts -i ./images -r corner -t 0.15

# Output to new directory
tsx image/remove-watermark.ts -i ./images -m new-dir -o ./images/cleaned
```

### Notes

- Works best on semi-transparent watermarks
- Results vary depending on watermark type and image complexity
- Higher strength may affect image quality
- **Recommendation: Back up original images before processing**

---

## Images to PDF (images-to-pdf)

Combine multiple images into a single PDF file, with one image per page.

### Usage

```bash
tsx image/images-to-pdf.ts --input <images...|directories...> --output <output.pdf> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <paths...>` | Input images, directories, or glob patterns | Required |
| `-o, --output <file>` | Output PDF file | Required |
| `-l, --layout <mode>` | Page layout: portrait, landscape, auto | auto |
| `-s, --page-size <size>` | Page size: A4, Letter, Legal, A3 | A4 |
| `-m, --margin <pixels>` | Page margin | 0 |
| `-q, --quality <1-100>` | JPEG compression quality | 85 |
| `-g, --gap <pixels>` | Gap between images | 0 |
| `-y, --yes` | Skip all confirmation prompts | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Combine images from a directory
tsx image/images-to-pdf.ts -i ./photos -o output.pdf

# Specify multiple files
tsx image/images-to-pdf.ts -i photo1.jpg photo2.jpg photo3.jpg -o output.pdf

# Use glob patterns
tsx image/images-to-pdf.ts -i "*.jpg" -o photos.pdf

# Landscape A4 with margin
tsx image/images-to-pdf.ts -i ./images -o output.pdf -l landscape -s A4 -m 20
```

### Notes

- Each image occupies one page
- `auto` layout scales images to fit while maintaining aspect ratio
- Images are sorted by filename using natural sort order
- Supports: jpg, jpeg, png, webp, gif, avif, tiff, bmp

---

## Video Batch Convert (video-convert)

Convert video files to different formats using ffmpeg.

### Usage

```bash
tsx video/video-convert.ts --input <directory> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <directory>` | Source video directory | Required |
| `-f, --format <format>` | Output format: mp4, webm, avi, mkv, mov, gif | mp4 |
| `-c, --codec <codec>` | Video codec: h264, h265, vp9, av1 | h264 (for mp4) |
| `-q, --quality <number>` | CRF quality 18-28 (lower = better quality) | 23 |
| `-m, --mode <mode>` | Output mode: overwrite, new-dir | overwrite |
| `-o, --output <directory>` | Output directory (required when mode=new-dir) | - |
| `-y, --yes` | Skip all confirmation prompts | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Interactive mode
tsx video/video-convert.ts -i ./videos

# Convert to MP4 with high quality
tsx video/video-convert.ts -i ./videos -f mp4 -q 18 --yes

# Convert to WebM for web
tsx video/video-convert.ts -i ./videos -f webm -m new-dir -o ./videos/converted

# Convert to GIF
tsx video/video-convert.ts -i ./videos -f gif -q 90
```

### Notes

- Requires ffmpeg to be installed
- GIF conversion uses palette generation for better quality
- CRF 18 = high quality, CRF 23 = medium, CRF 28 = small file size
- Supported input formats: mp4, avi, mkv, mov, webm, wmv, flv, m4v, mpg, mpeg

---

## Video Transcription (video-transcribe)

Extract text/subtitles from video files using faster-whisper (Whisper AI).

### Usage

```bash
tsx video/video-transcribe.ts --input <file|directory> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <path>` | Video file or directory containing video files | Required |
| `-o, --output <directory>` | Output directory | Same as input |
| `--format <format>` | Output format: srt, txt, vtt, json | srt |
| `-l, --language <lang>` | Language code (e.g., zh, en, ja) | auto-detect |
| `--size <size>` | Model size: tiny, base, small, medium, large-v3 | medium |
| `--device <device>` | Device: cpu, cuda | cuda (if available) |
| `-w, --word-timestamps` | Include word-level timestamps | false |
| `-m, --filter-music` | Filter out music before transcription | false |
| `-y, --yes` | Skip all confirmation prompts | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Basic transcription (creates .srt file)
tsx video/video-transcribe.ts -i video.mp4

# Extract to plain text with language specified
tsx video/video-transcribe.ts -i video.mp4 --format txt --language zh

# Batch process directory
tsx video/video-transcribe.ts -i videos/ --format srt

# WebVTT format for web
tsx video/video-transcribe.ts -i video.mp4 -o subtitles/ --format vtt

# Include word-level timestamps
tsx video/video-transcribe.ts -i video.mp4 --word-timestamps

# Filter music from audio before transcription
tsx video/video-transcribe.ts -i video.mp4 --filter-music

# Use large model for better accuracy
tsx video/video-transcribe.ts -i video.mp4 --size large-v3
```

### Notes

- Requires Python with faster-whisper: `pip install faster-whisper`
- On Apple Silicon Mac, lightning-whisper-mlx will be used automatically if available: `pip3 install lightning-whisper-mlx`
- Supports CUDA for faster transcription (if NVIDIA GPU available)
- Supported input formats: mp4, avi, mkv, mov, webm, wmv, flv, m4v, mpg, mpeg

---

## Video Deduplication (video-dedup)

Remove redundant frames (duplicate/similar consecutive frames) from videos using ffmpeg mpdecimate filter.

### Usage

```bash
tsx video/video-dedup.ts --input <file|directory> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <path>` | Source video file or directory | Required |
| `-o, --output <path>` | Output path | input_dedup |
| `-y, --yes` | Skip confirmation prompt | false |
| `-H, --help` | Show help message | - |

### Examples

```bash
# Single file
tsx video/video-dedup.ts -i input.mp4

# Single file with custom output
tsx video/video-dedup.ts -i input.mp4 -o output_dedup.mp4

# Batch process directory
tsx video/video-dedup.ts -i ./videos --yes
```

### Notes

- Uses ffmpeg mpdecimate filter with conservative settings (hi=768:lo=640:frac=0.1)
- Only removes truly redundant frames, preserves scene changes
- Audio is copied without re-encoding
- Output is re-encoded with H.264 for consistency

---

## Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint
```

---

## Supported File Formats

### Image Formats

| Format | Extensions | Notes |
|--------|------------|-------|
| JPEG | .jpg, .jpeg | |
| PNG | .png | |
| WebP | .webp | |
| GIF | .gif | |
| AVIF | .avif | |
| TIFF | .tiff | |

### Video Formats

| Format | Extensions | Notes |
|--------|------------|-------|
| MP4 | .mp4 | |
| WebM | .webm | |
| AVI | .avi | |
| Matroska | .mkv | |
| QuickTime | .mov | |
| Windows Media | .wmv | |
| Flash Video | .flv | |
| MPEG | .mpg, .mpeg | |
| M4V | .m4v | |
| GIF | .gif | Animated GIF output only |
