const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const STORAGE_KEY = 'ai_camara_models';

interface ModelConfig {
  visionModel: string;
  imageModel: string;
  aspectRatio: string; // "1:1", "16:9", "9:16", "3:4", "4:3"
  imageSize: string;   // "1K", "2K", "4K"
}

const DEFAULT_CONFIG: ModelConfig = {
  visionModel: 'gemini-3.1-flash-lite-preview',
  imageModel: 'gemini-3.1-flash-image-preview',
  aspectRatio: '16:9',
  imageSize: '1K',
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
    reset() {
      saveModelConfig(DEFAULT_CONFIG);
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
- .config (view current config)
- .reset() (restore defaults)
    `.trim()
  };
}

/**
 * Encodes and compresses an image to a base64 string.
 * Resizes the image to a maximum dimension of 768px for token efficiency.
 */
export const processImageForApi = async (fileOrBlob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Target max dimension for Gemini Vision (768px is often enough for detailed descriptions)
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
      
      // Compress to JPEG at 0.8 quality
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      URL.revokeObjectURL(img.src);
      resolve(base64);
    };
    img.onerror = reject;
  });
};

/**
 * Validates the API key and checks if the required models are available.
 */
export const validateApiKey = async (apiKey: string): Promise<{ valid: boolean; error?: string }> => {
  try {
    const response = await fetch(`${BASE_URL}/models?key=${apiKey}`);
    
    if (!response.ok) {
      const error = await response.json();
      return { valid: false, error: error.error?.message || 'Invalid API key' };
    }

    const data = await response.json();
    const models = data.models || [];
    
    const config = getModelConfig();
    const requiredModels = [config.visionModel, config.imageModel];
    const availableModelNames = models.map((m: any) => m.name.split('/').pop());
    
    const missingModels = requiredModels.filter(m => !availableModelNames.includes(m));
    
    if (missingModels.length > 0) {
      return { 
        valid: false, 
        error: `Key valid, but missing required models: ${missingModels.join(', ')}` 
      };
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

  if (reason === 'PROHIBITED_CONTENT') {
    throw new Error('BLOCKED: Prohibited content detected.');
  }
  if (reason === 'SAFETY') {
    throw new Error('BLOCKED: Safety filters triggered.');
  }
  if (reason === 'RECITATION') {
    throw new Error('BLOCKED: Content flagged as copyrighted material.');
  }
  if (reason && reason !== 'STOP') {
    throw new Error(`BLOCKED: ${message || reason}`);
  }
};

/**
 * Calls the vision model to describe an image.
 */
export const describeImage = async (apiKey: string, imageBase64: string): Promise<string> => {
  const { visionModel } = getModelConfig();

  const response = await fetch(`${BASE_URL}/models/${visionModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Describe this image as detailed as possible. Focus on composition, colors, textures, lighting, and every small detail to reconstruct it later. Provide only the description." },
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
  const { imageModel, aspectRatio, imageSize } = getModelConfig();
  
  const response = await fetch(`${BASE_URL}/models/${imageModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        image_config: {
          aspect_ratio: aspectRatio,
          image_size: imageSize
        }
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
  
  if (!imageData) {
    console.error('[DEBUG] Unexpected response structure:', data);
    throw new Error('No image data found in response');
  }
  
  return `data:${mimeType};base64,${imageData}`;
};
