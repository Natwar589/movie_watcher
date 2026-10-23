'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './VideoPlayer.module.css';

export const PRESET_MOVIES = [
  {
    title: 'Big Buck Bunny (Animation Short)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80',
    tag: 'Animation • 4K',
  },
  {
    title: 'Tears of Steel (Sci-Fi Cyberpunk)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
    tag: 'Sci-Fi • Action',
  },
  {
    title: 'Sintel (Fantasy / Adventure)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    poster: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200&auto=format&fit=crop&q=80',
    tag: 'Fantasy • Drama',
  },
  {
    title: 'Elephants Dream (Surreal 3D)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
    tag: 'Cyber • Mystery',
  },
];

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({ url, title, onLoaded, user, members, onSysMsg, onScreenShare, remoteHostStream }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Playback & stream state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ambientGlow, setAmbientGlow] = useState(true);

  // Window / Screen Sharing & Anti-Echo state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [hasStreamAudio, setHasStreamAudio] = useState(false);
  const [streamSourceType, setStreamSourceType] = useState('url'); // 'screen' | 'file' | 'url'
  const [echoShield, setEchoShield] = useState(true);

  // Track active URL for imperative use (avoids stale closures)
  const activeUrlRef = useRef(url);
  activeUrlRef.current = url;

  // Modals & inputs
  const [customInput, setCustomInput] = useState('');
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);

  const hideControlsTimeout = useRef(null);

  const isHost = !!user?.isHost;

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current && !isScreenSharing) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && !isScreenSharing) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = useCallback(() => {
    if (isScreenSharing) return; // Screen stream is live
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          onSysMsg?.(`▶️ ${user?.name || 'Someone'} resumed playback`);
        })
        .catch((e) => {
          console.warn('Video play deferred:', e.message);
        });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      onSysMsg?.(`⏸️ ${user?.name || 'Someone'} paused playback`);
    }
  }, [isScreenSharing, user, onSysMsg]);

  const handleSeek = (e) => {
    if (isScreenSharing) return;
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      onSysMsg?.(`⏩ ${user?.name || 'Someone'} jumped to ${formatTime(time)}`);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleSpeedChange = (speed) => {
    if (isScreenSharing) return;
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      onSysMsg?.(`⚡ Playback speed set to ${speed}x`);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      if (isPlaying || isScreenSharing) setShowControls(false);
    }, 3000);
  };

  /* ─────────────────────────────────────────────────────────
     WINDOW / SCREEN SHARING HANDLER (Stream from Host's Window)
     ───────────────────────────────────────────────────────── */
  const startScreenShare = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        alert('Screen & window sharing is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', displaySurface: 'window' },
        audio: true,
      });

      setScreenStream(stream); // master effect attaches it to video
      setStreamSourceType('screen');
      setHasStreamAudio(stream.getAudioTracks().length > 0);
      onLoaded('', `${user?.name || 'Host'}'s Shared Window (Live Movie Stream)`);
      setIsSourceModalOpen(false);
      onScreenShare?.(stream); // broadcast to guests via WebRTC
      onSysMsg?.(`📺 ${user?.name || 'Host'} is now streaming their window/movie!`);

      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {
      console.warn('Screen share was dismissed or failed:', err);
    }
  };

  const toggleEchoShield = () => {
    const nextState = !echoShield;
    setEchoShield(nextState);
    if (videoRef.current && isScreenSharing) {
      // If echoShield is enabled, local video is muted to prevent echo
      videoRef.current.muted = nextState;
      if (!nextState) {
        videoRef.current.volume = volume || 0.8;
      }
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null); // master effect restores URL
    }
    setStreamSourceType('url');
    onScreenShare?.(null); // stop broadcasting to guests
    // Restore fallback movie
    if (PRESET_MOVIES.length > 0) {
      const fallback = PRESET_MOVIES[0];
      onLoaded(fallback.url, fallback.title);
    }
    onSysMsg?.(`⏹️ ${user?.name || 'Host'} stopped sharing their window.`);
  };

  /* ─────────────────────────────────────────────────────────
     LOCAL FILE PICKER (Host picks a video file from laptop)
     ───────────────────────────────────────────────────────── */
  const handleLocalFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    }
    const localUrl = URL.createObjectURL(file);
    onLoaded(localUrl, file.name); // master effect picks up new url
    setStreamSourceType('file');
    setIsSourceModalOpen(false);
    onSysMsg?.(`📁 ${user?.name || 'Host'} loaded: "${file.name}"`);
  };

  const selectPreset = (movie) => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    }
    onLoaded(movie.url, movie.title); // master effect picks up new url
    setStreamSourceType('url');
    setIsSourceModalOpen(false);
  };

  const applyCustomUrl = (e) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    }
    onLoaded(customInput.trim(), 'Custom Stream'); // master effect picks up new url
    setStreamSourceType('url');
    setIsSourceModalOpen(false);
    setCustomInput('');
  };

  // Default initial movie if idle (host & guests get a preset movie on first load)
  useEffect(() => {
    if (!url && !isScreenSharing && !remoteHostStream && PRESET_MOVIES.length > 0) {
      const first = PRESET_MOVIES[0];
      onLoaded(first.url, first.title);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  /* ═══════════════════════════════════════════════════════════
     MASTER VIDEO SOURCE CONTROLLER
     Priority: remoteHostStream > local screenStream > url
     This is the ONLY place that touches video.src / video.srcObject
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (remoteHostStream) {
      // GUEST MODE: host is sharing their screen → show it
      if (v.srcObject !== remoteHostStream) {
        v.srcObject = remoteHostStream;
        v.removeAttribute('src');
        v.muted = false;
        v.load();
        v.play().catch(() => {});
      }
      setIsPlaying(true);
      setIsScreenSharing(true);
    } else if (screenStream) {
      // HOST MODE: sharing local screen
      if (v.srcObject !== screenStream) {
        v.srcObject = screenStream;
        v.removeAttribute('src');
        v.muted = true; // anti-echo: host hears it from source app
        v.play().catch(() => {});
      }
      setIsScreenSharing(true);
    } else {
      // URL MODE: normal movie playback
      if (v.srcObject) {
        v.srcObject = null;
        v.removeAttribute('src');
      }
      setIsScreenSharing(false);
      if (url && v.getAttribute('src') !== url) {
        v.src = url;
        v.muted = false;
        v.load();
        v.play().catch(() => {});
      }
    }
  }, [remoteHostStream, screenStream, url]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${ambientGlow ? styles.glowActive : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => (isPlaying || isScreenSharing) && setShowControls(false)}
    >
      {/* Hidden local file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleLocalFileSelect}
      />

      {/* Ambient background bloom */}
      {ambientGlow && <div className={styles.ambientLight} />}

      {/* Main Video Element */}
      <div className={styles.videoWrapper} onClick={!isScreenSharing ? togglePlay : undefined}>
        <video
          ref={videoRef}
          className={styles.video}
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Center Play Overlay Icon when paused and not screen sharing */}
        {!isPlaying && !isScreenSharing && (
          <div className={styles.centerPlayButton} onClick={togglePlay}>
            <div className={styles.playIconPulse}>▶</div>
          </div>
        )}

        {/* Live Window Stream Watermark & Anti-Echo Shield */}
        {isScreenSharing && (
          <div className={styles.streamStatusGroup}>
            <div className={styles.liveScreenBadge}>
              <span className={styles.liveScreenDot} />
              <span>LIVE WINDOW STREAM • {user?.name || 'Host'}</span>
              {hasStreamAudio && <span className={styles.audioTag}>🔊 Tab Audio Transmitting</span>}
            </div>

            <div className={`${styles.echoShieldBadge} ${echoShield ? styles.shieldActive : styles.shieldInactive}`}>
              <span className={styles.shieldIcon}>{echoShield ? '🛡️' : '⚠️'}</span>
              <span className={styles.shieldLabel}>
                {echoShield ? 'Anti-Echo Shield Active (Local preview muted to prevent loop)' : 'Echo Shield Off (Audio might loop)'}
              </span>
              <button
                type="button"
                className={styles.shieldBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleEchoShield();
                }}
                title={echoShield ? 'Unmute local monitor (Only if using headphones)' : 'Mute local preview to stop echo'}
              >
                {echoShield ? 'Monitor Audio' : 'Mute Local to Stop Echo'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Top Overlay Badge / Controls */}
      <div className={`${styles.topBar} ${showControls ? styles.visible : ''}`}>
        <div className={styles.movieMeta}>
          <div className={styles.badgeRow}>
            {isScreenSharing ? (
              <span className={styles.screenShareTag}>🔴 HOST WINDOW STREAM</span>
            ) : (
              <span className={styles.liveTag}>MOVIE PLAYER</span>
            )}
            {isHost && <span className={styles.hostRoleTag}>👑 Room Host</span>}
          </div>
          <h2 className={styles.movieTitle}>
            {isScreenSharing ? `Streaming: ${title}` : title || 'Choose a Movie'}
          </h2>
        </div>

        <div className={styles.topActions}>
          <div className={styles.syncBadge} title="Synced across all connected peers">
            <span className={styles.syncDot} />
            <span>{isScreenSharing ? 'LIVE BROADCAST' : 'SYNCED'} • {members?.length || 1} PEERS</span>
          </div>

          {/* Prominent Host Window Share Button */}
          {isHost && (
            isScreenSharing ? (
              <button
                className={styles.stopShareBtn}
                onClick={stopScreenShare}
                title="Stop sharing your window"
              >
                ⏹ Stop Window Stream
              </button>
            ) : (
              <button
                className={styles.shareWindowBtn}
                onClick={startScreenShare}
                title="Share your window or browser tab to stream the movie"
              >
                🖥️ Share My Window
              </button>
            )
          )}

          <button
            className={styles.sourceBtn}
            onClick={() => setIsSourceModalOpen(true)}
            title="Change Movie Source or Window"
          >
            🎬 Media Source
          </button>
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className={`${styles.bottomControls} ${showControls ? styles.visible : ''}`}>
        {/* Progress Bar (Hidden during live window stream) */}
        {!isScreenSharing && (
          <div className={styles.progressContainer}>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className={styles.progressBar}
              style={{
                background: `linear-gradient(to right, #6366f1 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
              }}
            />
          </div>
        )}

        <div className={styles.controlsRow}>
          <div className={styles.leftGroup}>
            {!isScreenSharing ? (
              <>
                <button
                  className={styles.ctrlBtn}
                  onClick={togglePlay}
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  className={styles.ctrlBtn}
                  onClick={() => videoRef.current && (videoRef.current.currentTime -= 10)}
                  title="Rewind 10s (←)"
                >
                  ⏪ 10s
                </button>
                <button
                  className={styles.ctrlBtn}
                  onClick={() => videoRef.current && (videoRef.current.currentTime += 10)}
                  title="Forward 10s (→)"
                >
                  10s ⏩
                </button>
              </>
            ) : (
              <div className={styles.liveIndicatorText}>
                <span className={styles.livePulseDot} />
                <span>Streaming directly from {user?.name || 'host'}&apos;s window</span>
              </div>
            )}

            {/* Volume Control */}
            <div className={styles.volumeGroup}>
              <button className={styles.ctrlBtn} onClick={toggleMute} title="Mute (M)">
                {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
              />
            </div>

            {/* Time Stamp (for video files) */}
            {!isScreenSharing && (
              <span className={styles.timeDisplay}>
                {formatTime(currentTime)} <span className={styles.timeSep}>/</span> {formatTime(duration)}
              </span>
            )}
          </div>

          <div className={styles.rightGroup}>
            {/* Speed Selector (for recorded videos) */}
            {!isScreenSharing && (
              <div className={styles.speedSelector}>
                {[0.75, 1, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`${styles.speedBtn} ${playbackRate === speed ? styles.speedActive : ''}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}

            {/* Quick Share Window shortcut for host if not active */}
            {isHost && !isScreenSharing && (
              <button
                className={styles.quickShareBtn}
                onClick={startScreenShare}
                title="Stream from Netflix, YouTube, or your desktop window"
              >
                🖥️ Stream Window
              </button>
            )}

            {/* Ambient Lighting toggle */}
            <button
              className={`${styles.ctrlBtn} ${ambientGlow ? styles.glowBtnActive : ''}`}
              onClick={() => setAmbientGlow(!ambientGlow)}
              title="Toggle Ambient Theatre Glow"
            >
              ✨
            </button>

            {/* Fullscreen button */}
            <button className={styles.ctrlBtn} onClick={toggleFullscreen} title="Fullscreen (F)">
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>
        </div>
      </div>

      {/* Media Source & Window Picker Modal */}
      {isSourceModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsSourceModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <h3>Choose Movie Source</h3>
                <p>Stream your window (Netflix, YouTube), load a local file, or pick a preset</p>
              </div>
              <button className={styles.modalClose} onClick={() => setIsSourceModalOpen(false)}>✕</button>
            </div>

            {/* Host Window Streaming Hero Card */}
            <div className={styles.hostStreamingCard}>
              <div className={styles.hostStreamIcon}>🖥️</div>
              <div className={styles.hostStreamText}>
                <h4>Share Your Window / Screen (Recommended)</h4>
                <p>
                  Open Netflix, YouTube, VLC, or Disney+ in another window or browser tab, and stream it live to all room members!
                </p>
              </div>
              {isScreenSharing ? (
                <button className={styles.streamCardStopBtn} onClick={stopScreenShare}>
                  ⏹ Stop Stream
                </button>
              ) : (
                <button className={styles.streamCardStartBtn} onClick={startScreenShare}>
                  🚀 Start Window Stream
                </button>
              )}
            </div>

            {/* Secondary Option: Pick Local File */}
            <div className={styles.localFileCard} onClick={() => fileInputRef.current?.click()}>
              <div className={styles.localFileIcon}>📁</div>
              <div className={styles.localFileText}>
                <h4>Play Local Video File from Your Computer</h4>
                <p>Choose any .mp4, .mkv, or .webm video saved on your hard drive</p>
              </div>
              <button type="button" className={styles.localFileBtn}>
                Browse Files
              </button>
            </div>

            {/* Presets Grid */}
            <div className={styles.presetSection}>
              <h4>Or Choose from Demo Movies</h4>
              <div className={styles.presetsGrid}>
                {PRESET_MOVIES.map((movie) => (
                  <div
                    key={movie.url}
                    className={`${styles.presetCard} ${url === movie.url && !isScreenSharing ? styles.presetSelected : ''}`}
                    onClick={() => selectPreset(movie)}
                  >
                    <div
                      className={styles.cardCover}
                      style={{ backgroundImage: `url(${movie.poster})` }}
                    >
                      <span className={styles.cardTag}>{movie.tag}</span>
                    </div>
                    <div className={styles.cardInfo}>
                      <h5>{movie.title}</h5>
                      <span className={styles.cardAction}>
                        {url === movie.url && !isScreenSharing ? '● Playing' : '▶ Play this'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom URL Input */}
            <div className={styles.customUrlSection}>
              <h4>Or Direct Video / Stream URL (.mp4 / .webm)</h4>
              <form onSubmit={applyCustomUrl} className={styles.urlForm}>
                <input
                  type="url"
                  placeholder="https://example.com/movie.mp4"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className={styles.urlInput}
                />
                <button type="submit" className={styles.urlSubmitBtn}>Load Stream</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
