# CLI Tools

A collection of CLI tools for common tasks.

## Tools

### Image Batch Crop (crop-images)

Crop images in a directory to a specified aspect ratio.

#### Installation

```bash
npm install
```

#### Usage

```bash
tsx image/crop-images.ts --input <directory> [options]
```

#### Options

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

#### Examples

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

#### Notes

- When using `new-dir` mode, if the output directory already exists, it will automatically increment (e.g., `cropped-1`, `cropped-2`)
- Max width/height resizes images before cropping while maintaining aspect ratio

### Video Batch Convert (video-convert)

Convert video files to different formats using ffmpeg.

#### Installation

```bash
# Requires ffmpeg installed
# macOS: brew install ffmpeg
# Ubuntu/Debian: sudo apt install ffmpeg
npm install
```

#### Usage

```bash
tsx video/video-convert.ts --input <directory> [options]
```

#### Options

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

#### Examples

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

#### Notes

- Requires ffmpeg to be installed on the system
- GIF conversion uses palette generation for better quality
- CRF 18 = high quality, CRF 23 = medium, CRF 28 = small file size

## Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint
```
