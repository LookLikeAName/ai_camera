import { useRef, useState, useEffect, useMemo } from 'react';
import { describeImage, generateImage, processImageForApi, injectGpsMetadata, ensureJpeg } from '../api/gemini';

interface CameraInterfaceProps {
  apiKey: string | null;
  aspectRatio: string;
  filterId: string;
  imageSize: string;
  enableGps: boolean;
  appMode: 'upload' | 'camera';
  onProcessingChange?: (processing: boolean) => void;
}

const CameraInterface: React.FC<CameraInterfaceProps> = ({ apiKey, aspectRatio, filterId, imageSize, enableGps, appMode, onProcessingChange }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const [subStatus, setSubStatus] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [showDownloadStarted, setShowDownloadStarted] = useState(false);
  const [summaryWords, setSummaryWords] = useState<string[]>([]);
  const [visibleWordsCount, setVisibleWordsCount] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestRequestId = useRef<number>(0);
  const summaryContainerRef = useRef<HTMLDivElement>(null);
  
  const [vfSize, setVfSize] = useState({ width: 0, height: 0 });

  const resetState = () => {
    // 1. Invalidate current request ID
    latestRequestId.current = Date.now();
    
    // 2. Kill network connections
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
    setSummaryWords([]);
    setVisibleWordsCount(0);
    setLoading(false);
    onProcessingChange?.(false);
  };

  useEffect(() => {
    const processing = loading || (!!originalPreview && !resultImage);
    onProcessingChange?.(processing);
  }, [loading, originalPreview, resultImage, onProcessingChange]);

  // Handle summary animation looping and auto-scrolling
  useEffect(() => {
    let interval: number;
    if (summaryWords.length > 0 && loading && originalPreview && !resultImage) {
      interval = window.setInterval(() => {
        setVisibleWordsCount(prev => {
          const next = prev >= summaryWords.length ? 0 : prev + 1;
          
          // Handle auto-scroll
          if (summaryContainerRef.current) {
            if (next === 0) {
              summaryContainerRef.current.scrollTop = 0;
            } else {
              summaryContainerRef.current.scrollTop = summaryContainerRef.current.scrollHeight;
            }
          }
          
          return next;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [summaryWords, loading, originalPreview, resultImage]);

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

  useEffect(() => {
    resetState();
  }, [aspectRatio, appMode, filterId, imageSize, enableGps]);

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
      
      const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
      const targetRatio = wRatio / hRatio;
      
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const videoRatio = videoWidth / videoHeight;
      
      let sw, sh, sx, sy;
      
      if (videoRatio > targetRatio) {
        // Video is wider than viewfinder (crop sides)
        sh = videoHeight;
        sw = videoHeight * targetRatio;
        sx = (videoWidth - sw) / 2;
        sy = 0;
      } else {
        // Video is taller than viewfinder (crop top/bottom)
        sw = videoWidth;
        sh = videoWidth / targetRatio;
        sx = 0;
        sy = (videoHeight - sh) / 2;
      }

      // We set canvas to the cropped size
      canvas.width = sw;
      canvas.height = sh;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
        canvas.toBlob(async (blob) => {
          if (blob) {
            await processImage(blob);
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const captureGpsAndProceed = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        performCapture();
      }, (err) => {
        console.warn("Location error:", err);
        setCoords(null);
        performCapture();
      });
    } else {
      setCoords(null);
      performCapture();
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
      if (enableGps) {
        captureGpsAndProceed();
      } else {
        setCoords(null);
        await performCapture();
      }
    } else {
      setCoords(null);
      fileInputRef.current?.click();
    }
  };

  const processImage = async (fileOrBlob: Blob) => {
    if (!apiKey) return;
    
    // SETUP: Generate unique ID and start AbortController
    const myRequestId = Date.now();
    latestRequestId.current = myRequestId;
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;
    
    try {
      setLoading(true);
      setErrorMessage(null);
      setResultImage(null);
      
      if (appMode === 'camera') stopCamera();

      setOriginalPreview(URL.createObjectURL(fileOrBlob));
      
      setStatus('ANALYZING...');
      setSubStatus('OPTIMIZING IMAGE & TRANSLATING');
      
      const base64 = await processImageForApi(fileOrBlob);
      
      // POINT 1: Within I2T request
      const description = await describeImage(apiKey, base64, signal);
      
      // POINT 2: Between I2T and T2I
      if (myRequestId !== latestRequestId.current || signal.aborted) return;

      // Parse summary
      const summaryMatch = description.match(/<summary>([\s\S]*?)<\/summary>/);
      if (summaryMatch) {
        const summary = summaryMatch[1].trim();
        setSummaryWords(summary.split(/\s+/));
        setVisibleWordsCount(0);
      }

      console.log('[DEBUG] AI Vision Description:', description);

      setStatus('RECONSTRUCTING...');
      setSubStatus('DREAMING IN PROGRESS (10-30S)');
      
      // POINT 3: Within T2I request
      const generatedImageUrl = await generateImage(apiKey, description, signal);
      
      // FINAL GATE: Before updating React state
      if (myRequestId !== latestRequestId.current || signal.aborted) return;

      setResultImage(generatedImageUrl);
      setStatus('READY');
      setSubStatus('');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`[AiCamera] Request ${myRequestId} aborted.`);
        return;
      }
      
      // Only show error if this is still the active request
      if (myRequestId === latestRequestId.current) {
        console.error(err);
        
        // Reset only functional states, keep error visible
        setResultImage(null);
        setOriginalPreview(null);
        setCoords(null);
        setLoading(false);
        onProcessingChange?.(false);
        
        setErrorMessage(err.message || 'SYSTEM FAILURE');
        setStatus('IDLE');
      }
    } finally {
      // Clean up controller if this was the last request
      if (myRequestId === latestRequestId.current && !signal.aborted) {
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

    // Show download started feedback
    setShowDownloadStarted(true);
    setTimeout(() => setShowDownloadStarted(false), 3000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImage(file);
    }
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

        {loading && summaryWords.length > 0 && (
          <div className="summary-container" ref={summaryContainerRef}>
            {summaryWords.slice(0, visibleWordsCount).map((word, i) => (
              <span key={`${i}-${visibleWordsCount < i ? 'reset' : 'show'}`} className="summary-word">
                {word}
              </span>
            ))}
          </div>
        )}

        {showDownloadStarted && (
          <div className="error-popup" style={{ borderColor: 'var(--camera-accent)', padding: '1rem', zIndex: 150 }}>
            <div className="error-icon" style={{ borderColor: 'var(--camera-accent)', color: 'var(--camera-accent)', width: '20px', height: '20px', fontSize: '0.8rem' }}>↓</div>
            <div className="error-title" style={{ color: 'var(--camera-accent)', fontSize: '0.7rem' }}>DOWNLOAD STARTED</div>
            <div className="error-msg" style={{ fontSize: '0.5rem' }}>Your image is being saved to your device.</div>
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
