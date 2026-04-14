/**
 * Shared utilities for CLI tools
 */

// Console utilities
export { colors, colorize, createInterface, question, confirm, type ColorName, type ReadlineInterface } from './console.js'

// File utilities
export {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  isImageFile,
  isVideoFile,
  getImageFiles,
  getVideoFiles,
  ensureUniqueDir,
  processFiles,
} from './files.js'

// Format utilities
export { askFormat, askMode } from './format.js'
