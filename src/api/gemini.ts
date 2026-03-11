import * as piexif from 'piexifjs';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const STORAGE_KEY = 'ai_camara_models';

export interface FilterOption {
  id: string;
  name: string;
  description: string;
  visionInstruction: string;
}

export const PRESET_FILTERS: FilterOption[] = [
  { 
    id: 'none', 
    name: 'NONE', 
    description: '',
    visionInstruction: 'Provide a high-fidelity, literal description of this image for reconstruction. Avoid subjective interpretations and focus strictly on observable physical attributes.'
  },
  { 
    id: 'cyberpunk', 
    name: 'CYBERPUNK', 
    description: 'In a neon-lit cyberpunk style, with high contrast, vibrant blues and pinks, futuristic atmosphere.',
    visionInstruction: 'Analyze this image and describe it as if it were a neon-lit cyberpunk scene. Focus on how the elements would look with futuristic augmentation, vibrant neon lighting, and high-tech-low-life atmosphere.'
  },
  { 
    id: 'oilpainting', 
    name: 'OIL PAINTING', 
    description: 'In the style of a classical oil painting, with visible brushstrokes, rich textures, and warm lighting.',
    visionInstruction: 'Analyze this image and describe it as if it were a classical oil painting. Focus on the textures of brushstrokes, the play of light and shadow (chiaroscuro), and the richness of the pigments.'
  },
  { 
    id: 'sketch', 
    name: 'SKETCH', 
    description: 'As a detailed pencil sketch, monochrome, with fine lines and shading.',
    visionInstruction: 'Analyze this image and describe it as if it were a detailed pencil sketch. Focus on the linework, cross-hatching, varied lead weights, and the texture of the paper.'
  },
  { 
    id: 'pixelart', 
    name: 'PIXEL ART', 
    description: 'In a retro 8-bit pixel art style, with limited color palette and blocky textures.',
    visionInstruction: 'Analyze this image and describe it as if it were a retro 8-bit pixel art piece. Focus on the blocky sprite-like subjects, the dithered shading, and the specific limited color palette of an old game console.'
  },
  { 
    id: 'watercolor', 
    name: 'WATERCOLOR', 
    description: 'As a soft watercolor painting, with bleeding colors and delicate textures.',
    visionInstruction: 'Analyze this image and describe it as if it were a delicate watercolor painting. Focus on the bleeding edges of colors, the transparency of the layers, and the visible texture of the watercolor paper.'
  },
  { 
    id: 'custom', 
    name: 'CUSTOM', 
    description: '',
    visionInstruction: '' 
  },
];

const VISION_DETAIL_GUIDE = `
1. Global Scene: A concise summary of the setting and overall atmosphere.
2. Composition & Perspective: Define the camera angle, framing, and use of negative space.
3. Subject Mapping: List all subjects and their precise spatial relationships and positions within the frame.
4. Micro-Detail: For each subject, describe its exact scale, specific color shades, textures, and orientation.
5. Technical Lighting: Identify light sources, shadow directions, and highlights to define 3D volume.
6. Artistic Style: Identify the medium and rendering techniques.
IMPORTANT: Prefix the final section with "STYLE: ".
Provide only the description.`;

const DEFAULT_VISION_PROMPT = `Provide a high-fidelity, literal description of this image for reconstruction. Avoid subjective interpretations and focus strictly on observable physical attributes. ${VISION_DETAIL_GUIDE}`;

// Session-scoped variable for vision prompt
let sessionVisionPrompt = DEFAULT_VISION_PROMPT;

interface ModelConfig {
  visionModel: string;
  imageModel: string;
  aspectRatio: string; // "1:1", "16:9", "9:16", "3:4", "4:3"
  imageSize: string;   // "1K", "2K", "4K"
  filterId: string;
  customFilterDescription: string;
  enableGps: boolean;
}

const DEFAULT_CONFIG: ModelConfig = {
  visionModel: 'gemini-3.1-flash-lite-preview',
  imageModel: 'gemini-3.1-flash-image-preview',
  aspectRatio: '16:9',
  imageSize: '1K',
  filterId: 'none',
  customFilterDescription: '',
  enableGps: false,
};

/**
 * Loads model config from localStorage or defaults.
 */
const getModelConfig = (): ModelConfig => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
};

/**
 * Saves model config to localStorage.
 */
const saveModelConfig = (config: ModelConfig) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

// Expose config to window for console access
if (typeof window !== 'undefined') {
  (window as any).AiCamaraConfig = {
    get config() {
      return getModelConfig();
    },
    setVisionModel(model: string) {
      const current = getModelConfig();
      saveModelConfig({ ...current, visionModel: model });
      console.log(`[AiCamara] Vision model updated to: ${model}`);
    },
    setImageModel(model: string) {
      const current = getModelConfig();
      saveModelConfig({ ...current, imageModel: model });
      console.log(`[AiCamara] Image model updated to: ${model}`);
    },
    setAspectRatio(ratio: string) {
      const validRatios = ["1:1", "16:9", "9:16", "3:4", "4:3"];
      if (!validRatios.includes(ratio)) {
        console.error(`[AiCamara] Invalid ratio. Use: ${validRatios.join(', ')}`);
        return;
      }
      const current = getModelConfig();
      saveModelConfig({ ...current, aspectRatio: ratio });
      console.log(`[AiCamara] Aspect ratio updated to: ${ratio}`);
    },
    setImageSize(size: string) {
      const validSizes = ["1K", "2K", "4K"];
      if (!validSizes.includes(size.toUpperCase())) {
        console.error(`[AiCamara] Invalid size. Use: ${validSizes.join(', ')}`);
        return;
      }
      const current = getModelConfig();
      saveModelConfig({ ...current, imageSize: size.toUpperCase() });
      console.log(`[AiCamara] Image size updated to: ${size.toUpperCase()}`);
    },
    setFilter(filterId: string, customDesc: string = '') {
      const current = getModelConfig();
      saveModelConfig({ ...current, filterId, customFilterDescription: customDesc });
      console.log(`[AiCamara] Filter updated to: ${filterId}`);
    },
    setEnableGps(enabled: boolean) {
      const current = getModelConfig();
      saveModelConfig({ ...current, enableGps: enabled });
      console.log(`[AiCamara] GPS enabled: ${enabled}`);
    },
    setVisionPrompt(prompt: string) {
      sessionVisionPrompt = prompt;
      console.log(`[AiCamara] Vision system prompt updated for this session.`);
    },
    get visionPrompt() {
      return sessionVisionPrompt;
    },
    reset() {
      saveModelConfig(DEFAULT_CONFIG);
      sessionVisionPrompt = DEFAULT_VISION_PROMPT;
      console.log('[AiCamara] Config reset to defaults.');
    },
    updateConfig(partial: Partial<ModelConfig>) {
      const current = getModelConfig();
      saveModelConfig({ ...current, ...partial });
      return getModelConfig();
    },
    help: `
Use window.AiCamaraConfig to modify settings:
- .setVisionModel('model-id')
- .setImageModel('model-id')
- .setAspectRatio('1:1' | '16:9' | '9:16' | '4:3' | '3:4')
- .setImageSize('1K' | '2K' | '4K')
- .setFilter('filter-id', 'optional-custom-desc')
- .setEnableGps(true | false)
- .setVisionPrompt('your custom system prompt') (Session only)
- .visionPrompt (View current system prompt)
- .config (view current config)
- .reset() (restore defaults)
    `.trim()
  };
}

/**
 * Encodes and compresses an image to a base64 string.
 */
export const processImageForApi = async (fileOrBlob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      const MAX_DIM = 768;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Failed to get canvas context');
      
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      URL.revokeObjectURL(img.src);
      resolve(base64);
    };
    img.onerror = reject;
  });
};

/**
 * Injects GPS coordinates into a base64 JPEG image.
 */
export const injectGpsMetadata = (base64Image: string, latitude: number, longitude: number): string => {
  try {
    const zeroth: any = {};
    const exif: any = {};
    const gps: any = {};

    // Helper to convert decimal coordinates to EXIF rational format
    const toRational = (n: number) => {
      const deg = Math.floor(Math.abs(n));
      const min = Math.floor((Math.abs(n) - deg) * 60);
      const sec = Math.round(((Math.abs(n) - deg) * 60 - min) * 60 * 100);
      return [[deg, 1], [min, 1], [sec, 100]];
    };

    gps[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? 'N' : 'S';
    gps[piexif.GPSIFD.GPSLatitude] = toRational(latitude);
    gps[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? 'E' : 'W';
    gps[piexif.GPSIFD.GPSLongitude] = toRational(longitude);
    gps[piexif.GPSIFD.GPSDateStamp] = new Date().toISOString().replace(/-/g, ':').split('T')[0];

    const exifObj = { "0th": zeroth, "Exif": exif, "GPS": gps };
    const exifBytes = piexif.dump(exifObj);
    
    // Ensure we have a data URL with jpeg mime type
    const dataUrl = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    const newImage = piexif.insert(exifBytes, dataUrl);
    
    return newImage;
  } catch (err) {
    console.error("EXIF Injection failed:", err);
    return base64Image; // Return original if it fails
  }
};

/**
 * Ensures an image is a JPEG by drawing it onto a canvas.
 */
export const ensureJpeg = async (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#FFFFFF"; // Background for transparency
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
  });
};

/**
 * Validates the API key and checks if the required models are available.
 */
export const validateApiKey = async (apiKey: string): Promise<{ valid: boolean; error?: string }> => {
  try {
    const response = await fetch(`${BASE_URL}/models`, {
      headers: { 'x-goog-api-key': apiKey }
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { valid: false, error: error.error?.message || 'Invalid API key' };
    }

    const data = await response.json();
    const models = data.models || [];
    const config = getModelConfig();
    const availableModelNames = models.map((m: any) => m.name.split('/').pop());
    const missingModels = [config.visionModel, config.imageModel].filter(m => !availableModelNames.includes(m));
    
    if (missingModels.length > 0) {
      return { valid: false, error: `Key valid, but missing required models: ${missingModels.join(', ')}` };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Connection error' };
  }
};

/**
 * Handles errors based on the candidate's finishReason.
 */
const handleCandidateError = (candidate: any) => {
  if (!candidate) return;
  const reason = candidate.finishReason || candidate.finish_reason;
  const message = candidate.finishMessage || candidate.finish_message;
  if (reason === 'PROHIBITED_CONTENT') throw new Error('BLOCKED: Prohibited content detected.');
  if (reason === 'SAFETY') throw new Error('BLOCKED: Safety filters triggered.');
  if (reason === 'RECITATION') throw new Error('BLOCKED: Content flagged as copyrighted material.');
  if (reason && reason !== 'STOP') throw new Error(`BLOCKED: ${message || reason}`);
};

/**
 * Calls the vision model to describe an image.
 */
export const describeImage = async (apiKey: string, imageBase64: string): Promise<string> => {
  const { visionModel, filterId, customFilterDescription } = getModelConfig();
  
  // Decide which base instruction to use
  let baseInstruction = sessionVisionPrompt;
  const selectedFilter = PRESET_FILTERS.find(f => f.id === filterId);
  
  if (sessionVisionPrompt === DEFAULT_VISION_PROMPT) {
    // If using the default prompt, we can inject style-specific vision instructions
    if (filterId === 'custom' && customFilterDescription) {
      baseInstruction = `Analyze this image and describe it as if it were a ${customFilterDescription}. Focus on how the subjects and atmosphere would be represented in that medium. ${VISION_DETAIL_GUIDE}`;
    } else if (selectedFilter && selectedFilter.visionInstruction) {
      baseInstruction = `${selectedFilter.visionInstruction} ${VISION_DETAIL_GUIDE}`;
    }
  }

  const response = await fetch(`${BASE_URL}/models/${visionModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: baseInstruction },
          { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
        ]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to describe image');
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  handleCandidateError(candidate);
  const description = candidate?.content?.parts?.[0]?.text;
  if (!description) throw new Error('No description generated');
  return description;
};

/**
 * Calls the image model to generate an image from a prompt.
 */
export const generateImage = async (apiKey: string, prompt: string): Promise<string> => {
  const { imageModel, aspectRatio, imageSize, filterId, customFilterDescription } = getModelConfig();
  
  // Use the vision model's prompt directly, just clean up the prefix
  const finalPrompt = prompt.replace('STYLE:', '').trim();

  console.log('[DEBUG] Final Prompt sent to Image Model:', finalPrompt);

  const response = await fetch(`${BASE_URL}/models/${imageModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        image_config: { aspect_ratio: aspectRatio, image_size: imageSize }
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to generate image');
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  handleCandidateError(candidate);
  const imagePart = candidate?.content?.parts?.find((p: any) => p.inline_data || p.inlineData);
  const imageData = imagePart?.inline_data?.data || imagePart?.inlineData?.data;
  const mimeType = imagePart?.inline_data?.mime_type || imagePart?.inlineData?.mimeType || 'image/png';
  if (!imageData) throw new Error('No image data found in response');
  return `data:${mimeType};base64,${imageData}`;
};
