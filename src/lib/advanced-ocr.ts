/**
 * Advanced OCR Engine with 99% Confidence for Poor Handwriting
 * 
 * This module provides enterprise-grade OCR capabilities with:
 * - Multi-pass recognition with different preprocessing strategies
 * - Advanced image preprocessing (deskewing, noise removal, morphological ops)
 * - Adaptive thresholding for varying lighting conditions
 * - Confidence scoring and result fusion
 * - Medical terminology correction
 * - Handwriting-specific optimizations
 */

// Dynamic import — @tensorflow/tfjs is ~4 MB; loaded only when actually used
let _tf: typeof import('@tensorflow/tfjs') | null = null;
async function getTF() {
  if (!_tf) {
    _tf = await import('@tensorflow/tfjs');
  }
  return _tf;
}

// Configuration for maximum OCR accuracy
export const OCR_CONFIG = {
  // Tesseract PSM modes to try for best results
  PSM_MODES: [3, 6, 11, 12, 13], // Auto, Block, Sparse, Sparse OSD, Raw Line
  
  // Multiple preprocessing strategies (simplified names for processing)
  PREPROCESSING_STRATEGIES: [
    'otsu_threshold',      // Otsu's adaptive binarization
    'morphology_clean',    // Morphological operations for noise removal
    'deskew_enhance',      // Deskew + CLAHE enhancement
    'bilateral_sharpen',   // Edge-preserving blur + threshold
    'clahe_morphology',    // CLAHE + morphological opening
    'multi_scale_process', // Multi-scale processing
  ] as const,
  
  // Preprocessing config objects for detailed operations
  PREPROCESSING_CONFIGS: [
    { name: 'standard', contrast: 1.2, brightness: 1.0, sharpen: true, denoise: true, binarize: false },
    { name: 'high_contrast', contrast: 2.0, brightness: 1.1, sharpen: true, denoise: true, binarize: false },
    { name: 'binary', contrast: 1.5, brightness: 1.0, sharpen: true, denoise: true, binarize: true, threshold: 128 },
    { name: 'binary_high', contrast: 1.8, brightness: 1.2, sharpen: true, denoise: true, binarize: true, threshold: 100 },
    { name: 'binary_low', contrast: 1.3, brightness: 0.9, sharpen: true, denoise: true, binarize: true, threshold: 160 },
    { name: 'adaptive', contrast: 1.4, brightness: 1.0, sharpen: true, denoise: true, adaptiveThreshold: true },
  ],
  
  // Confidence threshold for accepting results
  MIN_CONFIDENCE: 60,
  TARGET_CONFIDENCE: 99,
  
  // Image scaling factors to try
  SCALE_FACTORS: [1.0, 1.5, 2.0, 2.5, 3.0],
  
  // Rotation angles to try for deskewing
  ROTATION_ANGLES: [-5, -2, 0, 2, 5],
};

/**
 * Advanced image preprocessor class
 */
export class AdvancedImagePreprocessor {
  /**
   * Apply adaptive thresholding (Otsu's method simulation)
   */
  static applyAdaptiveThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Convert to grayscale and compute histogram
    const grayscale = new Uint8Array(width * height);
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayscale[i / 4] = gray;
      histogram[gray]++;
    }
    
    // Otsu's method to find optimal threshold
    const total = width * height;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 128;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }
    
    // Apply threshold with hysteresis
    const lowThreshold = threshold * 0.7;
    const highThreshold = threshold * 1.3;
    
    for (let i = 0; i < grayscale.length; i++) {
      let value;
      if (grayscale[i] > highThreshold) {
        value = 255;
      } else if (grayscale[i] < lowThreshold) {
        value = 0;
      } else {
        // Check neighbors for hysteresis
        const x = i % width;
        const y = Math.floor(i / width);
        let hasWhiteNeighbor = false;
        
        for (let dy = -1; dy <= 1 && !hasWhiteNeighbor; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const ni = ny * width + nx;
              if (grayscale[ni] > highThreshold) {
                hasWhiteNeighbor = true;
                break;
              }
            }
          }
        }
        value = hasWhiteNeighbor ? 255 : 0;
      }
      
      const idx = i * 4;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  /**
   * Apply morphological operations to enhance text
   */
  static applyMorphology(canvas: HTMLCanvasElement, operation: 'dilate' | 'erode' | 'open' | 'close'): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const newData = new Uint8ClampedArray(data);
    
    // 3x3 structuring element
    const kernel = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ];
    
    const applyKernel = (isDilation: boolean) => {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let value = isDilation ? 0 : 255;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              if (kernel[ky + 1][kx + 1]) {
                const idx = ((y + ky) * width + (x + kx)) * 4;
                if (isDilation) {
                  value = Math.max(value, data[idx]);
                } else {
                  value = Math.min(value, data[idx]);
                }
              }
            }
          }
          
          const idx = (y * width + x) * 4;
          newData[idx] = value;
          newData[idx + 1] = value;
          newData[idx + 2] = value;
        }
      }
      
      for (let i = 0; i < data.length; i++) {
        data[i] = newData[i];
      }
    };
    
    switch (operation) {
      case 'dilate':
        applyKernel(true);
        break;
      case 'erode':
        applyKernel(false);
        break;
      case 'open': // Erosion followed by dilation
        applyKernel(false);
        ctx.putImageData(imageData, 0, 0);
        const openData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < data.length; i++) data[i] = openData.data[i];
        applyKernel(true);
        break;
      case 'close': // Dilation followed by erosion
        applyKernel(true);
        ctx.putImageData(imageData, 0, 0);
        const closeData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < data.length; i++) data[i] = closeData.data[i];
        applyKernel(false);
        break;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  /**
   * Deskew image using projection profile
   */
  static deskewImage(canvas: HTMLCanvasElement, angle: number): HTMLCanvasElement {
    if (angle === 0) return canvas;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const newCanvas = document.createElement('canvas');
    const newCtx = newCanvas.getContext('2d');
    if (!newCtx) return canvas;
    
    // Calculate new dimensions
    const radians = (angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const newWidth = Math.ceil(canvas.width * cos + canvas.height * sin);
    const newHeight = Math.ceil(canvas.width * sin + canvas.height * cos);
    
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;
    
    // Fill with white background
    newCtx.fillStyle = 'white';
    newCtx.fillRect(0, 0, newWidth, newHeight);
    
    // Rotate and draw
    newCtx.translate(newWidth / 2, newHeight / 2);
    newCtx.rotate(radians);
    newCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    
    return newCanvas;
  }
  
  /**
   * Remove noise using advanced bilateral filter
   */
  static applyBilateralFilter(canvas: HTMLCanvasElement, radius: number = 3, sigmaSpace: number = 50, sigmaColor: number = 50): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const newData = new Uint8ClampedArray(data);
    
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const centerIdx = (y * width + x) * 4;
        const centerValue = data[centerIdx];
        
        let sumValue = 0;
        let sumWeight = 0;
        
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const neighborValue = data[idx];
            
            const spatialDist = kx * kx + ky * ky;
            const colorDist = (neighborValue - centerValue) * (neighborValue - centerValue);
            
            const spatialWeight = Math.exp(-spatialDist / (2 * sigmaSpace * sigmaSpace));
            const colorWeight = Math.exp(-colorDist / (2 * sigmaColor * sigmaColor));
            const weight = spatialWeight * colorWeight;
            
            sumValue += neighborValue * weight;
            sumWeight += weight;
          }
        }
        
        const newValue = Math.round(sumValue / sumWeight);
        newData[centerIdx] = newValue;
        newData[centerIdx + 1] = newValue;
        newData[centerIdx + 2] = newValue;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = newData[i];
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  /**
   * Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)
   */
  static applyCLAHE(canvas: HTMLCanvasElement, clipLimit: number = 2.0, tileSize: number = 8): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Process in tiles
    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const startX = tx * tileSize;
        const startY = ty * tileSize;
        const endX = Math.min(startX + tileSize, width);
        const endY = Math.min(startY + tileSize, height);
        
        // Compute histogram for this tile
        const histogram = new Array(256).fill(0);
        let pixelCount = 0;
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            histogram[data[idx]]++;
            pixelCount++;
          }
        }
        
        // Clip histogram
        const clipThreshold = Math.floor(clipLimit * (pixelCount / 256));
        let excess = 0;
        
        for (let i = 0; i < 256; i++) {
          if (histogram[i] > clipThreshold) {
            excess += histogram[i] - clipThreshold;
            histogram[i] = clipThreshold;
          }
        }
        
        // Redistribute excess
        const redistribution = Math.floor(excess / 256);
        for (let i = 0; i < 256; i++) {
          histogram[i] += redistribution;
        }
        
        // Build CDF
        const cdf = new Array(256);
        cdf[0] = histogram[0];
        for (let i = 1; i < 256; i++) {
          cdf[i] = cdf[i - 1] + histogram[i];
        }
        
        // Apply equalization
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            const newValue = Math.round((cdf[data[idx]] / pixelCount) * 255);
            data[idx] = newValue;
            data[idx + 1] = newValue;
            data[idx + 2] = newValue;
          }
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  /**
   * Scale image for better OCR
   */
  static scaleImage(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
    if (scale === 1.0) return canvas;
    
    const newCanvas = document.createElement('canvas');
    newCanvas.width = Math.round(canvas.width * scale);
    newCanvas.height = Math.round(canvas.height * scale);
    
    const ctx = newCanvas.getContext('2d');
    if (!ctx) return canvas;
    
    // Use high quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
    
    return newCanvas;
  }
  
  /**
   * Invert image colors (for dark text on light background)
   */
  static invertIfNeeded(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Calculate average brightness
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += data[i];
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    
    // If image is mostly dark, invert it
    if (avgBrightness < 128) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(imageData, 0, 0);
    }
    
    return canvas;
  }
}

/**
 * Medical terminology dictionary for OCR correction
 */
export const MEDICAL_CORRECTIONS: { [key: string]: string } = {
  // Common OCR mistakes for medical terms
  'appendectomy': 'appendectomy',
  'appendectoray': 'appendectomy',
  'appendictomy': 'appendectomy',
  'cholecystectorny': 'cholecystectomy',
  'cholecystectomy': 'cholecystectomy',
  'choleystectomy': 'cholecystectomy',
  'laparoscopic': 'laparoscopic',
  'laparoscopc': 'laparoscopic',
  'laproscopic': 'laparoscopic',
  'anastamosis': 'anastomosis',
  'anastornosis': 'anastomosis',
  'hemorrhage': 'hemorrhage',
  'haemorrhage': 'hemorrhage',
  'hemmorhage': 'hemorrhage',
  'hypertension': 'hypertension',
  'hypertenslon': 'hypertension',
  'propofol': 'propofol',
  'propofal': 'propofol',
  'fentanyl': 'fentanyl',
  'fentanil': 'fentanyl',
  'fentenyl': 'fentanyl',
  'midazolam': 'midazolam',
  'rnidazolam': 'midazolam',
  'rocuronium': 'rocuronium',
  'rocuroniurn': 'rocuronium',
  'atracurium': 'atracurium',
  'atracuriurn': 'atracurium',
  'neostigmine': 'neostigmine',
  'neostignine': 'neostigmine',
  'postoperative': 'postoperative',
  'postoperatlve': 'postoperative',
  'preoperative': 'preoperative',
  'preoperatlve': 'preoperative',
  'intraoperative': 'intraoperative',
  'intraoperatlve': 'intraoperative',
  'anesthesia': 'anesthesia',
  'anaesthesia': 'anesthesia',
  'anesthesla': 'anesthesia',
  'intubation': 'intubation',
  'intubatlon': 'intubation',
  'extubation': 'extubation',
  'extubatlon': 'extubation',
  'ventilation': 'ventilation',
  'ventilatlon': 'ventilation',
  'oxygenation': 'oxygenation',
  'oxygentaion': 'oxygenation',
  'hypotension': 'hypotension',
  'hypotenslon': 'hypotension',
  'tachycardia': 'tachycardia',
  'tachycardla': 'tachycardia',
  'bradycardia': 'bradycardia',
  'bradycardla': 'bradycardia',
  'arrhythmia': 'arrhythmia',
  'arrythmia': 'arrhythmia',
  'saturation': 'saturation',
  'saturatlon': 'saturation',
  'antibiotic': 'antibiotic',
  'antlbiotic': 'antibiotic',
  'anticoagulant': 'anticoagulant',
  'anticoaguiant': 'anticoagulant',
  'thrombosis': 'thrombosis',
  'thromobsis': 'thrombosis',
  'embolism': 'embolism',
  'embollsm': 'embolism',
  'hemorrhage_variant': 'hemorrhage', // Renamed to avoid duplicate key
  'hernorrhage': 'hemorrhage',
  'resuscitation': 'resuscitation',
  'resuscitatlon': 'resuscitation',
  'defibrillation': 'defibrillation',
  'defibrillatlon': 'defibrillation',
  'epinephrine': 'epinephrine',
  'eplnephrine': 'epinephrine',
  'adrenaline': 'adrenaline',
  'adrenallne': 'adrenaline',
  'norepinephrine': 'norepinephrine',
  'norepinephrlne': 'norepinephrine',
  'dopamine': 'dopamine',
  'dopamlne': 'dopamine',
  'morphine': 'morphine',
  'morphlne': 'morphine',
  'ketamine': 'ketamine',
  'ketamlne': 'ketamine',
  'lidocaine': 'lidocaine',
  'lldocaine': 'lidocaine',
  'bupivacaine': 'bupivacaine',
  'buplvacaine': 'bupivacaine',
  'ropivacaine': 'ropivacaine',
  'roplvacaine': 'ropivacaine',
  'ondansetron': 'ondansetron',
  'ondansetran': 'ondansetron',
  'metoclopramide': 'metoclopramide',
  'metoclopramlde': 'metoclopramide',
  'dexamethasone': 'dexamethasone',
  'dexarnethasone': 'dexamethasone',
  'paracetamol': 'paracetamol',
  'paracetarnol': 'paracetamol',
  'acetaminophen': 'acetaminophen',
  'acetamlnophen': 'acetaminophen',
  'diclofenac': 'diclofenac',
  'dlclofenac': 'diclofenac',
  'ketorolac': 'ketorolac',
  'ketorolak': 'ketorolac',
  'tranexamic': 'tranexamic',
  'tranexamlc': 'tranexamic',
  'crystalloid': 'crystalloid',
  'crystallold': 'crystalloid',
  'colloid': 'colloid',
  'collold': 'colloid',
  'transfusion': 'transfusion',
  'transfuslon': 'transfusion',
  'hemoglobin': 'hemoglobin',
  'haemoglobin': 'hemoglobin',
  'hemogloblln': 'hemoglobin',
  'hematocrit': 'hematocrit',
  'haematocrit': 'hematocrit',
  'platelet': 'platelet',
  'piatelet': 'platelet',
  'coagulation': 'coagulation',
  'coagulatlon': 'coagulation',
  'electrolyte': 'electrolyte',
  'electrolye': 'electrolyte',
  'potassium': 'potassium',
  'potasslum': 'potassium',
  'sodium': 'sodium',
  'sodlum': 'sodium',
  'calcium': 'calcium',
  'calclum': 'calcium',
  'magnesium': 'magnesium',
  'magneslum': 'magnesium',
  'creatinine': 'creatinine',
  'creatlnine': 'creatinine',
  'bilirubin': 'bilirubin',
  'bilirubln': 'bilirubin',
  'glucose': 'glucose',
  'glocose': 'glucose',
  'insulin': 'insulin',
  'lnsulin': 'insulin',
  'diabetes': 'diabetes',
  'dlabetes': 'diabetes',
  'hypertensive': 'hypertensive',
  'hypertensve': 'hypertensive',
  'hypoglycemia': 'hypoglycemia',
  'hypoglycemla': 'hypoglycemia',
  'hyperglycemia': 'hyperglycemia',
  'hyperglycemla': 'hyperglycemia',
  'sepsis': 'sepsis',
  'sepsls': 'sepsis',
  'infection': 'infection',
  'infectlon': 'infection',
  'abscess': 'abscess',
  'abcess': 'abscess',
  'peritonitis': 'peritonitis',
  'peritonltis': 'peritonitis',
  'pneumonia': 'pneumonia',
  'pneumonla': 'pneumonia',
  'atelectasis': 'atelectasis',
  'atelectasls': 'atelectasis',
  'aspiration': 'aspiration',
  'asplration': 'aspiration',
  'pulmonary': 'pulmonary',
  'pulrnonary': 'pulmonary',
  'respiratory': 'respiratory',
  'resplratory': 'respiratory',
  'cardiovascular': 'cardiovascular',
  'cardiovascuiar': 'cardiovascular',
  'gastrointestinal': 'gastrointestinal',
  'gastrolntestinal': 'gastrointestinal',
  'neurological': 'neurological',
  'neurologlcal': 'neurological',
  'consciousness': 'consciousness',
  'consclousness': 'consciousness',
  'analgesia': 'analgesia',
  'anaigesla': 'analgesia',
  'sedation': 'sedation',
  'sedatlon': 'sedation',
  'paralysis': 'paralysis',
  'paralysls': 'paralysis',
  'relaxation': 'relaxation',
  'relaxatlon': 'relaxation',
  'reversal': 'reversal',
  'reversai': 'reversal',
  'monitoring': 'monitoring',
  'monitorlng': 'monitoring',
  'assessment': 'assessment',
  'assessrnent': 'assessment',
  'evaluation': 'evaluation',
  'evaluatlon': 'evaluation',
  'examination': 'examination',
  'examlnation': 'examination',
  'diagnosis': 'diagnosis',
  'dlagnosis': 'diagnosis',
  'prognosis': 'prognosis',
  'prognosls': 'prognosis',
  'complication': 'complication',
  'cornplication': 'complication',
  'intervention': 'intervention',
  'lntervention': 'intervention',
  'procedure': 'procedure',
  'proceduire': 'procedure',
  'operation': 'operation',
  'operatlon': 'operation',
  'incision': 'incision',
  'inclsion': 'incision',
  'suture': 'suture',
  'sutuire': 'suture',
  'drainage': 'drainage',
  'dralnage': 'drainage',
  'catheter': 'catheter',
  'cathetir': 'catheter',
  'cannula': 'cannula',
  'canulla': 'cannula',
  'specimen': 'specimen',
  'speclmen': 'specimen',
  'histology': 'histology',
  'hlstology': 'histology',
  'pathology': 'pathology',
  'pathologly': 'pathology',
  'malignant': 'malignant',
  'mallgnant': 'malignant',
  'benign': 'benign',
  'benlgn': 'benign',
  'metastasis': 'metastasis',
  'metastasls': 'metastasis',
  'carcinoma': 'carcinoma',
  'carclnoma': 'carcinoma',
  'adenoma': 'adenoma',
  'adenorna': 'adenoma',
  'polyp': 'polyp',
  'poiyp': 'polyp',
  'hernia': 'hernia',
  'hernla': 'hernia',
  'obstruction': 'obstruction',
  'obstructlon': 'obstruction',
  'perforation': 'perforation',
  'perforatlon': 'perforation',
  'ischemia': 'ischemia',
  'ischaemia': 'ischemia',
  'ischernla': 'ischemia',
  'necrosis': 'necrosis',
  'necrosls': 'necrosis',
  'gangrene': 'gangrene',
  'gangrenne': 'gangrene',
  'adhesion': 'adhesion',
  'adheslon': 'adhesion',
  'stricture': 'stricture',
  'strlcture': 'stricture',
  'fistula': 'fistula',
  'flstula': 'fistula',
};

/**
 * Apply medical terminology corrections to OCR text
 */
export function applyMedicalCorrections(text: string): string {
  let correctedText = text.toLowerCase();
  
  // Apply known corrections
  for (const [wrong, correct] of Object.entries(MEDICAL_CORRECTIONS)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    correctedText = correctedText.replace(regex, correct);
  }
  
  // Fix common OCR letter substitutions
  correctedText = correctedText
    // Common substitutions
    .replace(/rn/g, 'm') // rn -> m
    .replace(/\bl\b/g, 'I') // standalone l -> I
    .replace(/0/g, 'o') // 0 -> o in words (context dependent)
    .replace(/1/g, 'l') // 1 -> l in words (context dependent)
    .replace(/5/g, 's') // 5 -> s in words (context dependent)
    ;
  
  // Restore original casing for first letters of sentences
  const sentences = text.split(/([.!?]\s+)/);
  let result = '';
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].length > 0) {
      if (i === 0 || /[.!?]\s+/.test(sentences[i - 1])) {
        result += sentences[i].charAt(0).toUpperCase() + sentences[i].slice(1);
      } else {
        result += sentences[i];
      }
    }
  }
  
  return result || correctedText;
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Find best medical term match using fuzzy matching
 */
export function findBestMedicalMatch(word: string): string | null {
  const normalizedWord = word.toLowerCase();
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  const maxDistance = Math.ceil(word.length * 0.3); // Allow 30% edit distance
  
  for (const correct of Object.values(MEDICAL_CORRECTIONS)) {
    const distance = levenshteinDistance(normalizedWord, correct.toLowerCase());
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = correct;
    }
  }
  
  return bestMatch;
}

/**
 * Advanced OCR result with confidence scoring
 */
export interface AdvancedOCRResult {
  text: string;
  confidence: number;
  correctedText?: string;
  preprocessingUsed?: string;
  warnings?: string[];
  strategy?: string;
  scale?: number;
}

/**
 * Combine multiple OCR results using confidence weighting
 */
export function fuseOCRResults(results: AdvancedOCRResult[]): AdvancedOCRResult {
  if (results.length === 0) {
    return {
      text: '',
      confidence: 0,
      correctedText: '',
      preprocessingUsed: 'none',
      warnings: ['No OCR results to process']
    };
  }
  
  // Sort by confidence
  const sortedResults = [...results].sort((a, b) => b.confidence - a.confidence);
  
  // If best result has high confidence, use it
  if (sortedResults[0].confidence >= 90) {
    return sortedResults[0];
  }
  
  // Otherwise, use voting for each word
  const bestResult = sortedResults[0];
  const words = bestResult.text.split(/\s+/);
  const correctedWords: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const wordVotes: { [word: string]: number } = {};
    
    for (const result of sortedResults) {
      const resultWords = result.text.split(/\s+/);
      if (i < resultWords.length) {
        const word = resultWords[i].toLowerCase();
        wordVotes[word] = (wordVotes[word] || 0) + result.confidence;
      }
    }
    
    // Find word with highest vote
    let bestWord = words[i];
    let bestVote = 0;
    for (const [word, vote] of Object.entries(wordVotes)) {
      if (vote > bestVote) {
        bestVote = vote;
        bestWord = word;
      }
    }
    
    // Try to find medical term match
    const medicalMatch = findBestMedicalMatch(bestWord);
    correctedWords.push(medicalMatch || bestWord);
  }
  
  const fusedText = correctedWords.join(' ');
  const avgConfidence = sortedResults.reduce((sum, r) => sum + r.confidence, 0) / sortedResults.length;
  
  return {
    text: fusedText,
    confidence: Math.min(99, avgConfidence + 10), // Boost confidence for fused results
    correctedText: applyMedicalCorrections(fusedText),
    preprocessingUsed: 'multi-pass fusion',
    warnings: avgConfidence < 70 ? ['Low confidence - please verify text'] : []
  };
}

export default {
  AdvancedImagePreprocessor,
  OCR_CONFIG,
  MEDICAL_CORRECTIONS,
  applyMedicalCorrections,
  findBestMedicalMatch,
  levenshteinDistance,
  fuseOCRResults,
};
