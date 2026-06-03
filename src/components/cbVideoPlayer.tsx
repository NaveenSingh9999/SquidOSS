import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Download, SkipBack, SkipForward,
  PictureInPicture, ChevronLeft, ChevronRight, Loader
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  requestVideoManifest,
  requestVideoStreamUrl,
  type StreamingManifestResponse,
  type VideoQualityVariant
} from '@/lib/api';

interface VideoQuality {
  id: string; label: string; bandwidth: number;
  url?: string; height?: number; width?: number;
}
interface VideoPlayerAnalytics {
  onPlay: (p: number) => void; onPause: (p: number) => void;
  onSeek: (f: number, t: number) => void;
  onQualityChange: (q: VideoQuality) => void;
  onSpeedChange: (s: number) => void;
  onBufferStart: (p: number) => void; onBufferEnd: (p: number) => void;
  onComplete: () => void; onError: (e: string) => void;
}

interface cbVideoPlayerProps {
  file: { id: string; name: string; type: string; size: number };
  src: string | { master: string; qualities: VideoQuality[] };
  poster?: string; autoPlay?: boolean; useStreaming?: boolean;
  maxQuality?: string; playbackMode?: 'streaming' | 'download';
  muted?: boolean; loop?: boolean; analytics?: VideoPlayerAnalytics;
  onDownload?: () => void; onShare?: () => void; className?: string;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_AMOUNT = 10;
const HIDE_DELAY = 3000;

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const CBVideoPlayer: React.FC<cbVideoPlayerProps> = ({
  file, src, poster, autoPlay = false, useStreaming = false,
  maxQuality = '1080p', playbackMode = 'streaming', muted = false,
  loop = false, analytics, onDownload, onShare, className
}) => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTapRef = useRef(0);
  const seekingRef = useRef(false);
  const lastMoveRef = useRef(0);
  const fallbackModeRef = useRef(false);

  // Core state
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted_, setMuted] = useState(muted);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState<VideoQuality>({ id: 'auto', label: 'Auto', bandwidth: 0 });
  const [qualities, setQualities] = useState<VideoQuality[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pip, setPip] = useState(false);

  // Seek feedback state
  const [seekDir, setSeekDir] = useState<'forward' | 'backward' | null>(null);

  // Volume reveal
  const [showVol, setShowVol] = useState(false);

  // Streaming internals
  const [manifest, setManifest] = useState<StreamingManifestResponse | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [directStreamUrl, setDirectStreamUrl] = useState<string | null>(null);

  const { toast } = useToast();
  const isHls = useMemo(() => {
    if (fallbackModeRef.current || directStreamUrl) return false;
    if (typeof src === 'object') return true;
    if (manifest) return true;
    return src.includes('.m3u8') || src.includes('hls');
  }, [src, manifest, directStreamUrl]);

  // Reset fallback state when source changes
  useEffect(() => {
    fallbackModeRef.current = false;
    setDirectStreamUrl(null);
    setError(null);
    setStreamError(null);
    setManifest(null);
  }, [file?.id, typeof src === 'string' ? src : src?.master]);

  // --- Streaming manifest ---
  const fetchManifest = useCallback(async () => {
    if (!useStreaming || !file?.id) return;
    setManifestLoading(true);
    try {
      const m = await requestVideoManifest(file.id, maxQuality, playbackMode);
      setManifest(m);
    } catch (e) {
      setStreamError((e as Error).message);
    } finally {
      setManifestLoading(false);
    }
  }, [useStreaming, file?.id, maxQuality, playbackMode]);

  useEffect(() => {
    if (useStreaming && file?.id && !manifest && !manifestLoading && !streamError) {
      fetchManifest();
    }
  }, [useStreaming, file?.id, manifest, manifestLoading, streamError, fetchManifest]);

  // --- HLS init ---
  const initHls = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Hls.isSupported()) return;
    hlsRef.current?.destroy();

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 60,
      maxBufferLength: 30,
      maxBufferSize: 100 * 1000 * 1000,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      abrEwmaFastVoD: 3,
      abrEwmaSlowVoD: 9,
      abrEwmaDefaultEstimate: 5e5,
      abrBandWidthFactor: 0.9,
      abrBandWidthUpFactor: 0.7,
      startLevel: -1,
      testBandwidth: true,
      fragLoadingTimeOut: 15000,
      manifestLoadingTimeOut: 10000,
      levelLoadingTimeOut: 10000,
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const levels = hls.levels.map((lv, i) => ({
        id: String(i), label: `${lv.height}p`, bandwidth: lv.bitrate,
        height: lv.height, width: lv.width,
      }));
      setQualities([{ id: 'auto', label: 'Auto', bandwidth: 0 }, ...levels]);
      setQuality({ id: 'auto', label: 'Auto', bandwidth: 0 });
      setLoading(false);
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          // Fatal error (e.g., DEMUXER_ERROR) — fall back to direct byte-range streaming
          hls.destroy();
          hlsRef.current = null;
          fallbackModeRef.current = true;
          const videoEl = videoRef.current;
          if (videoEl) {
            videoEl.src = '';
            videoEl.load();
          }
          setLoading(true);
          requestVideoStreamUrl(file.id, 'stream')
            .then(res => {
              const streamUrl = res.url;
              setDirectStreamUrl(streamUrl);
              if (videoEl) {
                videoEl.src = streamUrl;
                videoEl.load();
                setLoading(false);
              }
            })
            .catch(err => {
              setError(err.message || 'Streaming fallback failed');
              setLoading(false);
            });
        }
      }
    });

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      if (video.buffered.length > 0) {
        const b = video.buffered.end(video.buffered.length - 1);
        setBuffered(duration > 0 ? (b / duration) * 100 : 0);
      }
    });

    let source: string;
    if (manifest) {
      source = manifest.masterManifestUrl;
      if (manifest.variants.length > 0) {
        const auto = { id: 'auto', label: 'Auto', bandwidth: 0 };
        const qs = manifest.variants.map(v => ({
          id: v.qualityId, label: v.label, bandwidth: v.bandwidth, url: v.playlistUrl,
        }));
        setQualities([auto, ...qs]);
        setQuality(auto);
      }
    } else if (typeof src === 'object') {
      source = src.master;
      if (src.qualities) {
        setQualities([{ id: 'auto', label: 'Auto', bandwidth: 0 }, ...src.qualities]);
      }
    } else {
      source = src;
    }

    hls.loadSource(source);
    hls.attachMedia(video);
  }, [src, manifest, duration, toast]);

  // --- Player init effect ---
  useEffect(() => {
    if (useStreaming && !manifest && !streamError) return;
    const video = videoRef.current;
    if (!video) return;

    if (fallbackModeRef.current) {
      if (directStreamUrl) {
        video.src = directStreamUrl;
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    seekingRef.current = false;
    setPip('requestPictureInPicture' in video);

    if (isHls && Hls.isSupported()) {
      initHls();
    } else {
      video.src = typeof src === 'string' ? src : src.master;
      setLoading(false);
    }

    return () => {
      if (!fallbackModeRef.current) {
        hlsRef.current?.destroy();
        hlsRef.current = null;
      }
      if (video) { video.src = ''; video.load(); }
    };
  }, [isHls, src, useStreaming, manifest, manifestLoading, directStreamUrl, streamError]);

  // --- Hide controls timer ---
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setControls(false), HIDE_DELAY);
    }
  }, [playing]);

  const showControls = useCallback(() => {
    setControls(true);
    scheduleHide();
  }, [scheduleHide]);

  // --- Video events ---
  const onLoadedData = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setLoading(false);
    setPlaying(!v.paused);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || seekingRef.current) return;
    setCurrentTime(v.currentTime);
  }, []);

  const onPlay = useCallback(() => {
    setPlaying(true);
    analytics?.onPlay(currentTime);
    scheduleHide();
  }, [currentTime, analytics, scheduleHide]);

  const onPause = useCallback(() => {
    setPlaying(false);
    setControls(true);
    analytics?.onPause(currentTime);
  }, [currentTime, analytics]);

  const onWaiting = useCallback(() => {
    setLoading(true);
    analytics?.onBufferStart(currentTime);
  }, [currentTime, analytics]);

  const onCanPlay = useCallback(() => {
    setLoading(false);
    analytics?.onBufferEnd(currentTime);
  }, [currentTime, analytics]);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setControls(true);
    analytics?.onComplete();
  }, [analytics]);

  const onError = useCallback(() => {
    setError(videoRef.current?.error?.message || 'Playback error');
    analytics?.onError('Video playback error');
  }, [analytics]);

  // --- Controls ---
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => toast({ title: "Playback Error", description: "Could not start playback", variant: "destructive" }));
    } else {
      v.pause();
    }
  }, [toast]);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const nt = Math.max(0, Math.min(duration, v.currentTime + delta));
    v.currentTime = nt;
    setCurrentTime(nt);
    setSeekDir(delta > 0 ? 'forward' : 'backward');
    setTimeout(() => setSeekDir(null), 600);
    analytics?.onSeek(v.currentTime - delta, nt);
  }, [duration, analytics]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!v || !duration || !rect.width) return;
    const pct = (e.clientX - rect.left) / rect.width;
    const nt = Math.max(0, pct * duration);
    v.currentTime = nt;
    setCurrentTime(nt);
  }, [duration]);

  const setVol = useCallback((v: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = Math.max(0, Math.min(1, v));
    setVolume(videoRef.current.volume);
    setMuted(videoRef.current.volume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.volume > 0) { v.volume = 0; setMuted(true); }
    else { v.volume = volume || 0.5; setMuted(false); setVolume(v.volume); }
  }, [volume]);

  const toggleFs = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !('requestPictureInPicture' in v)) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await (v as any).requestPictureInPicture();
      }
    } catch { /* ignore */ }
  }, []);

  const changeSpeed = useCallback((s: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = s;
    setSpeed(s);
    analytics?.onSpeedChange(s);
  }, [analytics]);

  const changeQuality = useCallback((q: VideoQuality) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = q.id === 'auto' ? -1 : parseInt(q.id);
    }
    setQuality(q);
    analytics?.onQualityChange(q);
  }, [analytics]);

  // --- Keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      showControls();
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); seek(-5); break;
        case 'ArrowRight': e.preventDefault(); seek(5); break;
        case 'ArrowUp': e.preventDefault(); setVol(v.volume + 0.1); break;
        case 'ArrowDown': e.preventDefault(); setVol(v.volume - 0.1); break;
        case 'KeyF': e.preventDefault(); toggleFs(); break;
        case 'KeyM': e.preventDefault(); toggleMute(); break;
        case 'KeyP': e.preventDefault(); togglePip(); break;
        case 'KeyJ': e.preventDefault(); seek(-10); break;
        case 'KeyL': e.preventDefault(); seek(10); break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, setVol, toggleFs, toggleMute, togglePip, showControls]);

  // --- Mouse/touch controls ---
  const onContainerMove = useCallback(() => {
    lastMoveRef.current = Date.now();
    showControls();
  }, [showControls]);

  const onContainerLeave = useCallback(() => {
    if (playing) setTimeout(() => { if (Date.now() - lastMoveRef.current > 1000) setControls(false); }, 1000);
  }, [playing]);

  const onContainerClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const now = Date.now();

    if (now - lastTapRef.current < 300) {
      if (x < 0.4) seek(-SEEK_AMOUNT);
      else if (x > 0.6) seek(SEEK_AMOUNT);
      else togglePlay();
    } else {
      const id = setTimeout(() => {
        if (Date.now() - lastTapRef.current > 250) {
          if (x >= 0.35 && x <= 0.65) togglePlay();
          else showControls();
        }
      }, 280);
      setTimeout(() => clearTimeout(id), 350);
    }
    lastTapRef.current = now;
  }, [seek, togglePlay, showControls]);

  // --- Fullscreen change ---
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // --- Remaining time ---
  const remaining = useMemo(() => {
    if (!duration) return '0:00';
    return `-${formatTime(duration - currentTime)}`;
  }, [duration, currentTime]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white gap-4">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <span className="text-2xl">!</span>
        </div>
        <p className="text-white/80 text-sm">{error}</p>
        <button
          onClick={() => { setError(null); initHls(); }}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-colors"
        >Retry</button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full bg-black overflow-hidden select-none", className)}
      onMouseMove={onContainerMove}
      onMouseLeave={onContainerLeave}
      onClick={onContainerClick}
    >
      {/* --- Video --- */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        poster={poster}
        autoPlay={autoPlay}
        muted={muted_}
        loop={loop}
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        onLoadedData={onLoadedData}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onWaiting={onWaiting}
        onCanPlay={onCanPlay}
        onEnded={onEnded}
        onError={onError}
      />

      {/* --- Gradient Overlays --- */}
      <div className={cn(
        "absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none transition-opacity duration-500",
        controls ? "opacity-100" : "opacity-0"
      )} />

      <div className={cn(
        "absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none transition-opacity duration-500",
        controls ? "opacity-100" : "opacity-0"
      )} />

      {/* --- Title Overlay --- */}
      <div className={cn(
        "absolute top-0 inset-x-0 z-10 p-4 sm:p-6 transition-opacity duration-500",
        controls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <h1 className="text-white font-medium text-sm sm:text-base truncate max-w-md drop-shadow-lg">
          {file.name}
        </h1>
      </div>

      {/* --- Seek Feedback --- */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300",
        seekDir ? "opacity-100" : "opacity-0"
      )}>
        <div className={cn(
          "flex items-center gap-3 bg-black/50 backdrop-blur-md rounded-full px-6 py-3",
          seekDir === 'backward' && "pr-10",
          seekDir === 'forward' && "pl-10"
        )}>
          {seekDir === 'backward' && <ChevronLeft className="w-8 h-8 text-white" />}
          <span className="text-white font-bold text-lg">{SEEK_AMOUNT}s</span>
          {seekDir === 'forward' && <ChevronRight className="w-8 h-8 text-white" />}
        </div>
      </div>

      {/* --- Loading --- */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <Loader className="w-8 h-8 text-white animate-spin" />
            <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-white/20" />
          </div>
        </div>
      )}

      {/* --- Center Play Button (when paused) --- */}
      {!playing && !loading && !error && (
        <div className={cn(
          "absolute inset-0 flex items-center justify-center transition-all duration-300",
          controls ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}>
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          >
            <Play className="w-7 h-7 text-white ml-1" />
          </button>
        </div>
      )}

      {/* --- Controls Bottom --- */}
      <div className={cn(
        "absolute bottom-0 inset-x-0 z-10 transition-all duration-500",
        controls ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
      )}>
        {/* Progress Bar */}
        <div
          ref={progressRef}
          className="relative mx-3 sm:mx-4 group cursor-pointer py-2"
          onClick={(e) => { e.stopPropagation(); handleProgressClick(e); }}
        >
          <div className="relative h-1 group-hover:h-2 transition-all duration-150 bg-white/20 rounded-full overflow-hidden">
            {/* Buffer */}
            <div
              className="absolute inset-y-0 left-0 bg-white/30 rounded-full transition-all"
              style={{ width: `${buffered}%` }}
            />
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-red-600 rounded-full transition-all"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all scale-0 group-hover:scale-100 shadow-lg"
              style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-1 px-3 sm:px-4 pb-3 sm:pb-4">
          {/* Left Block */}
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="p-1.5 text-white hover:bg-white/10 rounded-lg transition-colors">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); seek(-SEEK_AMOUNT); }}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); seek(SEEK_AMOUNT); }}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-1"
            onMouseEnter={() => setShowVol(true)}
            onMouseLeave={() => setShowVol(false)}>
            <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              {muted_ || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div className={cn(
              "flex items-center transition-all duration-200 overflow-hidden",
              showVol ? "w-20 opacity-100" : "w-0 opacity-0"
            )}>
              <div className="w-16 h-1 bg-white/20 rounded-full relative cursor-pointer"
                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setVol((e.clientX - r.left) / r.width); }}>
                <div className="absolute inset-y-0 left-0 bg-white rounded-full"
                  style={{ width: `${(muted_ ? 0 : volume) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Time */}
          <span className="text-white/80 text-xs font-medium tabular-nums ml-1">
            {formatTime(currentTime)}
            <span className="text-white/40 mx-1">/</span>
            <span className="text-white/50">{remaining}</span>
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Speed */}
          <div className="relative group/speed hidden sm:block">
            <button className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs font-medium tabular-nums">
              {speed}x
            </button>
            <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 py-1.5 min-w-[80px] opacity-0 group-hover/speed:opacity-100 pointer-events-none group-hover/speed:pointer-events-auto transition-all duration-200 translate-y-1 group-hover/speed:translate-y-0">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => changeSpeed(s)}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors",
                    speed === s ? "text-white font-medium" : "text-white/60"
                  )}>
                  {s === 1 ? 'Normal' : `${s}x`}
                </button>
              ))}
            </div>
          </div>

          {/* Quality */}
          {qualities.length > 1 && (
            <div className="relative group/qual hidden sm:block">
              <button className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <Settings className="w-4 h-4" />
              </button>
              <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 py-1.5 min-w-[130px] opacity-0 group-hover/qual:opacity-100 pointer-events-none group-hover/qual:pointer-events-auto transition-all duration-200 translate-y-1 group-hover/qual:translate-y-0">
                <div className="px-3 pb-1 text-[10px] text-white/40 uppercase tracking-wider font-medium">Quality</div>
                {qualities.map(q => (
                  <button key={q.id} onClick={() => changeQuality(q)}
                    className={cn(
                      "w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors",
                      q.id === quality.id ? "text-white font-medium" : "text-white/60"
                    )}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PiP */}
          {pip && (
            <button onClick={(e) => { e.stopPropagation(); togglePip(); }}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
              <PictureInPicture className="w-4 h-4" />
            </button>
          )}

          {/* Download */}
          {onDownload && (
            <button onClick={(e) => { e.stopPropagation(); onDownload(); }}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={(e) => { e.stopPropagation(); toggleFs(); }}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CBVideoPlayer;
