import { useRef, useState, useEffect, useMemo } from 'react';
import { describeImage, generateImage, processImageForApi } from '../api/gemini';

interface CameraInterfaceProps {
  apiKey: string | null;
  aspectRatio: string;
  appMode: 'upload' | 'camera';
}

const CameraInterface: React.FC<CameraInterfaceProps> = ({ apiKey, aspectRatio, appMode }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const [subStatus, setSubStatus] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [vfSize, setVfSize] = useState({ width: 0, height: 0 });

  const resetState = () => {
    setResultImage(null);
    setOriginalPreview(null);
    setStatus('IDLE');
    setSubStatus('');
    setErrorMessage(null);
  };

  // Handle Camera Stream
  useEffect(() => {
    const startCamera = async () => {
      // Only start camera if we are in camera mode AND not loading AND no result image is currently shown
      if (appMode === 'camera' && !loading && !resultImage && !originalPreview) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Camera access error:", err);
          setErrorMessage("CAMERA ACCESS DENIED");
        }
      } else {
        stopCamera();
      }
    };

    startCamera();
    return () => stopCamera();
  }, [appMode, loading, resultImage, originalPreview]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Reset state when aspect ratio or app mode changes
  useEffect(() => {
    resetState();
  }, [aspectRatio, appMode]);

  // Calculate optimal viewfinder size
  useEffect(() => {
    const calculateSize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
      const targetRatio = wRatio / hRatio;
      
      let width, height;
      if (containerWidth / containerHeight > targetRatio) {
        height = containerHeight;
        width = containerHeight * targetRatio;
      } else {
        width = containerWidth;
        height = containerWidth / targetRatio;
      }
      setVfSize({ width: Math.floor(width), height: Math.floor(height) });
    };
    calculateSize();
    const observer = new ResizeObserver(calculateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [aspectRatio]);

  const handleCapture = async () => {
    if (loading) return;

    // "Next" function: Reset only works AFTER generated image is showed
    if (resultImage) {
      resetState();
      return;
    }

    // If an image is being processed (originalPreview exists but resultImage doesn't), shutter is disabled
    if (originalPreview) return;

    if (appMode === 'upload') {
      fileInputRef.current?.click();
      return;
    }

    // Camera Capture logic
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
          if (blob) {
            await processImage(blob);
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const processImage = async (fileOrBlob: Blob) => {
    if (!apiKey) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      setResultImage(null);
      
      if (appMode === 'camera') stopCamera();

      setOriginalPreview(URL.createObjectURL(fileOrBlob));
      
      setStatus('ANALYZING...');
      setSubStatus('OPTIMIZING IMAGE & TRANSLATING');
      
      const base64 = await processImageForApi(fileOrBlob);
      const description = await describeImage(apiKey, base64);
      console.log('[DEBUG] AI Vision Description:', description);

      setStatus('RECONSTRUCTING...');
      setSubStatus('DREAMING IN PROGRESS (10-30S)');
      const generatedImageUrl = await generateImage(apiKey, description);
      
      setResultImage(generatedImageUrl);
      setStatus('READY');
      setSubStatus('');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'SYSTEM FAILURE');
      setStatus('IDLE');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processImage(file);
  };

  const vfStyle = useMemo(() => ({
    width: `${vfSize.width}px`,
    height: `${vfSize.height}px`,
  }), [vfSize]);

  const isResetMode = !!resultImage;
  const isProcessing = loading || (!!originalPreview && !resultImage);

  return (
    <div className="viewfinder-container" ref={containerRef}>
      <div className="viewfinder" style={vfStyle}>
        <div className="status-indicator">
          {loading ? 'BUSY' : status}
        </div>
        
        {appMode === 'camera' && !loading && !resultImage && !originalPreview && !errorMessage && (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {loading && <div className="scan-line"></div>}
        {loading && <div className="noise-overlay"></div>}
        
        {loading && (
          <div className="loading-text-container">
            <div>{status}</div>
            <div className="loading-subtext">{subStatus}</div>
          </div>
        )}

        {errorMessage && (
          <div className="error-popup">
            <div className="error-icon">!</div>
            <div className="error-title">SYSTEM ERROR</div>
            <div className="error-msg">{errorMessage}</div>
            <button className="error-btn" onClick={() => { resetState(); handleCapture(); }}>
              RETRY
            </button>
            <button className="error-btn secondary" onClick={resetState}>CLOSE</button>
          </div>
        )}

        {resultImage ? (
          <>
            <img src={resultImage} alt="Reconstructed" className="image-preview" />
            <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '5px' }}>
               <button className="download-btn" style={{ position: 'static', background: '#fff' }} onClick={resetState}>NEW SHOT</button>
            </div>
            <button 
              className="download-btn" 
              onClick={() => {
                const link = document.createElement('a');
                link.href = resultImage;
                link.download = `reconstructed_${Date.now()}.png`;
                link.click();
              }}
            >
              DOWNLOAD
            </button>
          </>
        ) : originalPreview ? (
          <img 
            src={originalPreview} 
            alt="Original" 
            className="image-preview" 
            style={{ filter: loading ? 'grayscale(100%) blur(2px) opacity(0.3)' : 'grayscale(100%) opacity(0.5)' }} 
          />
        ) : !loading && appMode === 'upload' && (
          <div style={{ color: '#444', textAlign: 'center', fontSize: 'calc(0.7rem * var(--ui-scale))' }}>
            [ NO SIGNAL ]<br/>
            PRESS SHUTTER TO UPLOAD
          </div>
        )}
      </div>

      <div className="controls">
        <input 
          type="file" 
          accept="image/*" 
          className="hidden-input" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />
        <button 
          className={`shutter-btn ${loading ? 'loading' : ''}`} 
          onClick={handleCapture}
          disabled={isProcessing}
          style={{ opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
        >
          <div style={{ 
            width: '60%', 
            height: '60%', 
            borderRadius: '50%', 
            background: appMode === 'camera' && !isResetMode ? 'var(--camera-danger)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.4rem',
            color: '#000',
            fontWeight: 'bold'
          }}>
            {isResetMode ? 'NEW' : ''}
          </div>
        </button>
      </div>

      {originalPreview && (
        <div style={{ 
          position: 'absolute', 
          bottom: '80px', 
          left: '10px', 
          width: 'calc(80px * var(--ui-scale))', 
          height: 'calc(80px * var(--ui-scale))', 
          border: '1px solid var(--camera-border)', 
          background: 'black', 
          zIndex: 12 
        }}>
          <img src={originalPreview} alt="Original thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ fontSize: '0.4rem', background: 'rgba(0,0,0,0.7)', position: 'absolute', bottom: 0, width: '100%', textAlign: 'center' }}>PREVIEW</div>
        </div>
      )}
    </div>
  );
};

export default CameraInterface;
