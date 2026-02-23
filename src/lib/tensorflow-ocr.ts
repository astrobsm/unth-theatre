/**
 * TensorFlow.js OCR and Speech-to-Text Utilities
 * 
 * This module provides advanced machine learning capabilities for:
 * - Optical Character Recognition (OCR) using TensorFlow.js
 * - Speech-to-Text using Web Speech API with TensorFlow enhancement
 * - Image preprocessing and text extraction
 */

// Dynamic import — @tensorflow/tfjs is ~4 MB; loaded only when actually used
let _tf: typeof import('@tensorflow/tfjs') | null = null;
async function getTF() {
  if (!_tf) {
    _tf = await import('@tensorflow/tfjs');
  }
  return _tf;
}

// TensorFlow model cache
let ocrModel: any | null = null;
let isModelLoading = false;

/**
 * Initialize TensorFlow.js backend
 */
export async function initializeTensorFlow(): Promise<boolean> {
  try {
    const tf = await getTF();
    // Try WebGL backend first for better performance
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('TensorFlow.js initialized with backend:', tf.getBackend());
    return true;
  } catch (error) {
    console.warn('WebGL not available, falling back to CPU backend');
    try {
      const tf = await getTF();
      await tf.setBackend('cpu');
      await tf.ready();
      return true;
    } catch (cpuError) {
      console.error('Failed to initialize TensorFlow.js:', cpuError);
      return false;
    }
  }
}

/**
 * Preprocess image for OCR
 */
export async function preprocessImage(
  imageData: ImageData | HTMLImageElement | HTMLCanvasElement
): Promise<any> {
  const tf = await getTF();
  return tf.tidy(() => {
    // Convert to tensor
    let tensor = tf.browser.fromPixels(imageData);
    
    // Convert to grayscale
    const grayTensor = tf.mean(tensor, 2, true);
    
    // Normalize to [0, 1]
    const normalizedTensor = grayTensor.div(255.0);
    
    // Apply contrast enhancement
    const mean = normalizedTensor.mean();
    const enhancedTensor = normalizedTensor.sub(mean).mul(1.5).add(mean).clipByValue(0, 1);
    
    // Resize to standard size (for model input)
    const resizedTensor = tf.image.resizeBilinear(
      enhancedTensor as any,
      [224, 224]
    );
    
    // Add batch dimension
    return resizedTensor.expandDims(0);
  });
}

/**
 * Apply image enhancement filters
 */
export function applyImageEnhancements(
  canvas: HTMLCanvasElement,
  options: {
    contrast?: number;
    brightness?: number;
    sharpen?: boolean;
    denoise?: boolean;
    binarize?: boolean;
    threshold?: number;
  } = {}
): HTMLCanvasElement {
  const {
    contrast = 1.2,
    brightness = 1.0,
    sharpen = true,
    denoise = true,
    binarize = false,
    threshold = 128,
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Apply brightness and contrast
  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale first
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // Apply brightness and contrast
    let value = ((gray - 128) * contrast + 128) * brightness;
    
    // Binarize if requested
    if (binarize) {
      value = value > threshold ? 255 : 0;
    } else {
      value = Math.max(0, Math.min(255, value));
    }
    
    data[i] = value;     // R
    data[i + 1] = value; // G
    data[i + 2] = value; // B
  }

  // Apply denoising (simple median filter)
  if (denoise) {
    const width = canvas.width;
    const height = canvas.height;
    const newData = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const neighbors: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            neighbors.push(data[idx]);
          }
        }
        neighbors.sort((a, b) => a - b);
        const median = neighbors[4]; // Middle value
        const idx = (y * width + x) * 4;
        newData[idx] = median;
        newData[idx + 1] = median;
        newData[idx + 2] = median;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = newData[i];
    }
  }

  // Apply sharpening (unsharp mask)
  if (sharpen) {
    const width = canvas.width;
    const height = canvas.height;
    const sharpenKernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    const newData = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            sum += data[idx] * sharpenKernel[k++];
          }
        }
        const idx = (y * width + x) * 4;
        const value = Math.max(0, Math.min(255, sum));
        newData[idx] = value;
        newData[idx + 1] = value;
        newData[idx + 2] = value;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = newData[i];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Extract text regions from image using edge detection
 */
export async function detectTextRegions(
  imageData: ImageData
): Promise<{ x: number; y: number; width: number; height: number }[]> {
  const tf = await getTF();
  return tf.tidy(() => {
    const tensor = tf.browser.fromPixels(imageData, 1);
    
    // Apply Sobel edge detection
    const sobelX = tf.tensor2d([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]);
    const sobelY = tf.tensor2d([[-1, -2, -1], [0, 0, 0], [1, 2, 1]]);
    
    const input4d = tensor.expandDims(0).expandDims(-1) as any;
    const kernelX = sobelX.expandDims(-1).expandDims(-1) as any;
    const kernelY = sobelY.expandDims(-1).expandDims(-1) as any;
    
    const edgesX = tf.conv2d(input4d, kernelX, 1, 'same');
    const edgesY = tf.conv2d(input4d, kernelY, 1, 'same');
    
    const edges = tf.sqrt(tf.add(tf.square(edgesX), tf.square(edgesY)));
    
    // Threshold edges
    const threshold = edges.max().mul(0.1);
    const binaryEdges = edges.greater(threshold);
    
    // Get bounding boxes (simplified - return full image for now)
    return [{ x: 0, y: 0, width: imageData.width, height: imageData.height }];
  });
}

/**
 * Memory cleanup for TensorFlow tensors
 */
export async function cleanupTensors(): Promise<void> {
  const tf = await getTF();
  tf.disposeVariables();
  console.log('TensorFlow memory cleaned. Tensors in memory:', tf.memory().numTensors);
}

/**
 * Get TensorFlow memory stats
 */
export async function getMemoryStats(): Promise<{ numTensors: number; numBytes: number }> {
  const tf = await getTF();
  const memory = tf.memory();
  return {
    numTensors: memory.numTensors,
    numBytes: memory.numBytes,
  };
}

export default {
  initializeTensorFlow,
  preprocessImage,
  applyImageEnhancements,
  detectTextRegions,
  cleanupTensors,
  getMemoryStats,
};
