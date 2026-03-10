import { useRef, useState, useEffect, useMemo } from 'react';
import { describeImage, generateImage, processImageForApi, injectGpsMetadata, ensureJpeg } from '../api/gemini';

interface CameraInterfaceProps {
  apiKey: string | null;
  aspectRatio: string;
  filterId: string;
  imageSize: string;
  appMode: 'upload' | 'camera';
  onProcessingChange?: (processing: boolean) => void;
}

const CameraInterface: React.FC<CameraInterfaceProps> = ({ apiKey, aspectRatio, filterId, imageSize, appMode, onProcessingChange }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const [subStatus, setSubStatus] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [showGpsPrompt, setShowGpsPrompt] = useState(false);
  const gpsDecisionMade = useRef(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [vfSize, setVfSize] = useState({ width: 0, height: 0 });

  const resetState = () => {
    // Abort ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setResultImage(null);
    setOriginalPreview(null);
    setStatus('IDLE');
    setSubStatus('');
    setErrorMessage(null);
    setCoords(null);
    setLoading(false);
    onProcessingChange?.(false);
  };

  // Notify parent of processing state
  useEffect(() => {
    const processing = loading || (!!originalPreview && !resultImage);
    onProcessingChange?.(processing);
  }, [loading, originalPreview, resultImage, onProcessingChange]);

  // Handle Camera Stream
  useEffect(() => {
    const startCamera = async () => {
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

  // Reset state when key settings change
  useEffect(() => {
    resetState();
  }, [aspectRatio, appMode, filterId, imageSize]);

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

  const performCapture = async () => {
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

  const handleCapture = async () => {
    if (loading) return;

    if (resultImage) {
      resetState();
      return;
    }

    if (originalPreview) return;

    if (appMode === 'camera') {
      if (!gpsDecisionMade.current && !coords && "geolocation" in navigator) {
        setShowGpsPrompt(true);
        return;
      }
      await performCapture();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleGpsDecision = (enable: boolean) => {
    gpsDecisionMade.current = true;
    setShowGpsPrompt(false);
    if (enable) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        performCapture();
      }, (err) => {
        console.warn("Location error:", err);
        performCapture();
      });
    } else {
      performCapture();
    }
  };

  const processImage = async (fileOrBlob: Blob) => {
    if (!apiKey) return;
    
    abortControllerRef.current = new AbortController();
    
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
      
      if (abortControllerRef.current?.signal.aborted) return;

      console.log('[DEBUG] AI Vision Description:', description);

      setStatus('RECONSTRUCTING...');
      setSubStatus('DREAMING IN PROGRESS (10-30S)');
      const generatedImageUrl = await generateImage(apiKey, description);
      
      if (abortControllerRef.current?.signal.aborted) return;

      setResultImage(generatedImageUrl);
      setStatus('READY');
      setSubStatus('');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setErrorMessage(err.message || 'SYSTEM FAILURE');
      setStatus('IDLE');
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleDownload = async () => {
    if (!resultImage) return;
    
    let finalImage = resultImage;
    
    if (coords) {
      setStatus('PROCESSING EXIF...');
      const jpeg = await ensureJpeg(resultImage);
      finalImage = injectGpsMetadata(jpeg, coords.lat, coords.lng);
      setStatus('READY');
    }

    const link = document.createElement('a');
    link.href = finalImage;
    link.download = `reconstructed_${Date.now()}.jpg`;
    link.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImage(file);
    }
    // Reset input value so the same file can be selected again
    e.target.value = '';
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

        {showGpsPrompt && (
          <div className="error-popup" style={{ borderColor: 'var(--camera-accent)' }}>
            <div className="error-icon" style={{ borderColor: 'var(--camera-accent)', color: 'var(--camera-accent)' }}>?</div>
            <div className="error-title" style={{ color: 'var(--camera-accent)' }}>GPS TAGGING</div>
            <div className="error-msg">
              Enable GPS to add location data to your photo's EXIF metadata. 
              Info is only used for the file header. Camera works without it.
            </div>
            <button className="error-btn" style={{ background: 'var(--camera-accent)', color: 'black' }} onClick={() => handleGpsDecision(true)}>ENABLE GPS</button>
            <button className="error-btn secondary" onClick={() => handleGpsDecision(false)}>NO THANKS</button>
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
            <button className="download-btn" onClick={handleDownload}>
              DOWNLOAD {coords ? '(GPS+)' : ''}
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
