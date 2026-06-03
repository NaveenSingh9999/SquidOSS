import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2,
  RotateCcw,
  RotateCw,
  X,
  ChevronLeft,
  Airplay,
  Settings2
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileVideoPlayerProps {
  file: {
    id: string;
    name: string;
    size: number;
    file_path?: string;
    type?: string;
  };
  blobUrl?: string;
  onClose?: () => void;
  onDownload?: () => void;
}

const MobileVideoPlayer: React.FC<MobileVideoPlayerProps> = ({ 
  file, 
  blobUrl, 
  onClose,
  onDownload 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<{start: number; end: number}[]>([]);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  
  // Gesture state
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const lastTapRef = useRef(0);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  // Reset controls timeout
  const resetControlsTimeout = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    if (isPlaying && showControls) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 4000);
    }
  }, [isPlaying, showControls]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [resetControlsTimeout]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    // Track buffered ranges for chunk visualization
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const ranges: {start: number; end: number}[] = [];
        for (let i = 0; i < video.buffered.length; i++) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i)
          });
        }
        setBufferedRanges(ranges);
        
        // Calculate total load progress
        const totalBuffered = ranges.reduce((acc, range) => acc + (range.end - range.start), 0);
        setLoadProgress(video.duration > 0 ? (totalBuffered / video.duration) * 100 : 0);
      }
    };
    
    const handleWaiting = () => {
      setIsBuffering(true);
      setIsLoading(true);
    };
    
    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsLoading(false);
    };
    
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsLoading(false);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
    setShowControls(true);
    resetControlsTimeout();
  }, [isPlaying, resetControlsTimeout]);

  // Seek to position
  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newTime = Math.max(0, Math.min(duration, time));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    seekTo(currentTime + seconds);
    setShowControls(true);
    resetControlsTimeout();
    
    // Show double-tap indicator
    setDoubleTapSide(seconds > 0 ? 'right' : 'left');
    setTimeout(() => setDoubleTapSide(null), 500);
  }, [currentTime, seekTo, resetControlsTimeout]);

  // Handle progress bar touch/click
  const handleProgressInteraction = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!progressRef.current || !duration) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = percent * duration;
    
    setSeekPreviewTime(time);
    seekTo(time);
  }, [duration, seekTo]);

  // Double tap to skip
  const handleContainerTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const clientX = 'touches' in e ? (e as React.TouchEvent).changedTouches[0].clientX : (e as React.MouseEvent).clientX;
        const isLeftSide = clientX < rect.left + rect.width / 2;
        skip(isLeftSide ? -10 : 10);
      }
    } else {
      // Single tap - toggle controls
      setShowControls(prev => !prev);
    }
    
    lastTapRef.current = now;
  }, [skip]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
      setIsFullscreen(!isFullscreen);
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, [isFullscreen]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Set playback rate
  const setSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, []);

  // Format time display
  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none",
        isFullscreen && "fixed inset-0 z-[60]"
      )}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={blobUrl || file.file_path}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
        onClick={handleContainerTap}
      />

      {/* Loading Indicator - Apple-style with progress info */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-xl flex items-center justify-center">
            <div className="w-10 h-10 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
          </div>
          {loadProgress > 0 && loadProgress < 100 && (
            <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className="text-white/80 text-xs font-medium">{Math.round(loadProgress)}% loaded</span>
            </div>
          )}
        </div>
      )}

      {/* Double-tap skip indicator */}
      {doubleTapSide && (
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 pointer-events-none",
          doubleTapSide === 'left' ? 'left-16' : 'right-16'
        )}>
          <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 animate-in zoom-in-50 fade-in duration-200">
            {doubleTapSide === 'left' ? (
              <RotateCcw className="w-5 h-5 text-white" />
            ) : (
              <RotateCw className="w-5 h-5 text-white" />
            )}
            <span className="text-white text-sm font-medium">10s</span>
          </div>
        </div>
      )}

      {/* Center Play Button (when paused) */}
      {!isPlaying && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="pointer-events-auto w-20 h-20 rounded-full bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      <div 
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleContainerTap}
      >
        {/* Gradient overlays */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

        {/* Top Bar */}
        <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            className="h-11 w-11 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>

          <div className="flex-1 text-center px-4 min-w-0">
            <p className="text-white text-sm font-medium truncate">{file.name}</p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); /* Cast to AirPlay */ }}
            className="h-11 w-11 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm"
          >
            <Airplay className="w-5 h-5" />
          </Button>
        </header>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* Buffer/Load Status - Shows when loading chunks */}
          {isBuffering && !isLoading && (
            <div className="flex items-center justify-center gap-2 mb-2 animate-in fade-in duration-200">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-white/70 text-xs">Buffering...</span>
            </div>
          )}
          
          {/* Progress Bar with Chunk Visualization */}
          <div 
            ref={progressRef}
            className="relative h-10 flex items-center cursor-pointer group"
            onClick={(e) => { e.stopPropagation(); handleProgressInteraction(e); }}
            onTouchStart={(e) => { setIsSeeking(true); handleProgressInteraction(e); }}
            onTouchMove={handleProgressInteraction}
            onTouchEnd={() => setIsSeeking(false)}
          >
            {/* Track Background */}
            <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full overflow-hidden group-active:h-2 transition-all">
              {/* Buffered Chunks - Shows each buffered range */}
              {bufferedRanges.map((range, index) => (
                <div 
                  key={index}
                  className="absolute inset-y-0 bg-white/40 rounded-full"
                  style={{ 
                    left: `${(range.start / duration) * 100}%`,
                    width: `${((range.end - range.start) / duration) * 100}%`
                  }}
                />
              ))}
              {/* Progress (played portion) */}
              <div 
                className="absolute inset-y-0 left-0 bg-white rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            {/* Thumb */}
            <div 
              className={cn(
                "absolute w-4 h-4 bg-white rounded-full shadow-lg -translate-x-1/2 transition-transform",
                isSeeking ? "scale-125" : "scale-100 group-hover:scale-110"
              )}
              style={{ left: `${progress}%` }}
            />
          </div>

          {/* Time Display with Load Progress */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-white/90 text-xs font-medium tabular-nums">
              {formatTime(currentTime)}
            </span>
            {loadProgress < 100 && loadProgress > 0 && (
              <span className="text-white/40 text-[10px] font-medium">
                {Math.round(loadProgress)}% loaded
              </span>
            )}
            <span className="text-white/60 text-xs font-medium tabular-nums">
              -{formatTime(duration - currentTime)}
            </span>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            {/* Left controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className="h-11 w-11 rounded-full text-white hover:bg-white/10"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </Button>
            </div>

            {/* Center play controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); skip(-10); }}
                className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
              
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7" fill="white" />
                ) : (
                  <Play className="w-7 h-7 ml-1" fill="white" />
                )}
              </button>
              
              <button
                onClick={(e) => { e.stopPropagation(); skip(10); }}
                className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                <RotateCw className="w-6 h-6" />
              </button>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              {/* Speed selector */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                  className="h-11 w-auto px-3 rounded-full text-white hover:bg-white/10"
                >
                  <span className="text-sm font-medium">{playbackRate}x</span>
                </Button>
                
                {showSpeedMenu && (
                  <div 
                    className="absolute bottom-14 right-0 bg-black/80 backdrop-blur-xl rounded-2xl p-2 min-w-[100px] animate-in slide-in-from-bottom-2 fade-in duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setSpeed(rate)}
                        className={cn(
                          "w-full px-4 py-2.5 text-sm text-left rounded-xl transition-colors",
                          playbackRate === rate 
                            ? "bg-white/20 text-white font-medium" 
                            : "text-white/70 hover:bg-white/10"
                        )}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className="h-11 w-11 rounded-full text-white hover:bg-white/10"
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileVideoPlayer;
