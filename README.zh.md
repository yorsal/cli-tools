# CLI Tools

一个常用的 CLI 工具集合。

## 工具列表

### 图片批量裁剪 (crop-images)

批量裁剪目录中的图片为指定宽高比。

#### 安装

```bash
npm install
```

#### 使用方法

```bash
tsx image/crop-images.ts --input <目录> [选项]
```

#### 选项

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

#### 示例

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

#### 说明

- 使用 `new-dir` 模式时，如果输出目录已存在，会自动递增命名（如 `cropped-1`、`cropped-2`）
- 最大宽高会在裁剪前先缩放图片，同时保持原始宽高比

## 开发

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint
```
