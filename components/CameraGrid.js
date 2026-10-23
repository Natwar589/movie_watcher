'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './CameraGrid.module.css';

export default function CameraGrid({ members = [], user, code }) {
  const localVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  const [camEnabled, setCamEnabled] = useState(false);
  const [camError, setCamError] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [stream, setStream] = useState(null);
  const [isVirtualCam, setIsVirtualCam] = useState(false);
  const [copied, setCopied] = useState(false);

  /* Attach media stream safely whenever node or stream changes */
  const setLocalVideoNode = useCallback((node) => {
    localVideoRef.current = node;
    if (node && stream) {
      if (node.srcObject !== stream) {
        node.srcObject = stream;
      }
      node.play().catch((e) => console.warn('Local video auto-play warning:', e));
    }
  }, [stream]);

  /* Effect to ensure video element always receives stream upon mounting/updating */
  useEffect(() => {
    if (localVideoRef.current && stream) {
      if (localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [stream, camEnabled]);

  /* ─────────────────────────────────────────────────────────
     START REAL HARDWARE CAMERA (with robust fallback)
     ───────────────────────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    setCamError('');

    if (typeof window === 'undefined') return;

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCamError('Camera requires a secure context (https:// or http://localhost:3000).');
      return;
    }

    try {
      let s = null;
      // 1. Try requesting both camera and echo-cancelled microphone
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (audioVideoErr) {
        console.warn('Audio+video request failed, attempting video-only fallback:', audioVideoErr);
        // 2. If microphone fails or is blocked, fallback to video-only
        s = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setMicEnabled(false);
      }

      setStream(s);
      setIsVirtualCam(false);
      setCamEnabled(true);
      setCamError('');

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = s;
        localVideoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCamError('Camera permission was denied in your browser. Click the lock/camera icon in your URL address bar to allow camera access.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCamError('No physical webcam detected on this device. You can test with the Virtual Camera below.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCamError('Webcam is already in use by another application (e.g. Zoom, FaceTime, or another tab).');
      } else {
        setCamError(`Could not access camera: ${err.message || err.name}`);
      }
    }
  }, []);

  /* ─────────────────────────────────────────────────────────
     VIRTUAL TEST CAMERA (Canvas generator for testing when
     hardware camera is blocked or not plugged in)
     ───────────────────────────────────────────────────────── */
  const startVirtualCam = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');

      let hue = 0;
      const drawFrame = () => {
        hue = (hue + 1) % 360;
        // Background gradient
        const grad = ctx.createLinearGradient(0, 0, 320, 240);
        grad.addColorStop(0, `hsl(${hue}, 60%, 20%)`);
        grad.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 10%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 320, 240);

        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 320; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 240);
          ctx.stroke();
        }

        // Animated pulse circle
        const radius = 35 + Math.sin(Date.now() / 300) * 8;
        ctx.beginPath();
        ctx.arc(160, 100, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // User avatar emoji
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(user?.avatar || '👤', 160, 100);

        // Text banner
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${user?.name || 'You'} (Live Feed)`, 160, 160);

        ctx.font = '10px monospace';
        ctx.fillStyle = '#34d399';
        ctx.fillText(`● VIRTUAL CAM • ${new Date().toLocaleTimeString()}`, 160, 185);

        animFrameRef.current = requestAnimationFrame(drawFrame);
      };

      drawFrame();

      const vStream = canvas.captureStream(30);
      setStream(vStream);
      setIsVirtualCam(true);
      setCamEnabled(true);
      setCamError('');

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = vStream;
        localVideoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setCamError('Virtual camera error: ' + e.message);
    }
  }, [user]);

  /* Stop camera */
  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setStream(null);
    setCamEnabled(false);
    setIsVirtualCam(false);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  const toggleMic = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => {
          t.enabled = !t.enabled;
        });
        setMicEnabled((prev) => !prev);
      } else {
        alert('No microphone was active on this stream.');
      }
    }
  };

  const copyInvite = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const peers = members.filter((m) => !m.isMe);
  const totalSlots = members.length;
  const gridCols = totalSlots <= 2 ? 2 : totalSlots <= 4 ? 2 : 3;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <span className={styles.headerTitle}>📹 Room Cameras</span>
          <span className={styles.verifiedTag}>Verified Users</span>
        </div>
        <span className={styles.onlineBadge}>
          {members.length} Active Member{members.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.grid} style={{ '--cols': gridCols }}>
        {/* ── LOCAL USER CAMERA ── */}
        <div className={`${styles.camCard} ${styles.myCard}`}>
          <div className={styles.camBox}>
            {/* Always keep video element mounted so WebRTC / getUserMedia stream binds instantly */}
            <video
              ref={setLocalVideoNode}
              autoPlay
              muted
              playsInline
              className={styles.camVideo}
              style={{ display: camEnabled ? 'block' : 'none' }}
            />

            {!camEnabled && (
              <div className={styles.camPlaceholder}>
                <span className={styles.avatarEmoji}>{user?.avatar || '👤'}</span>
                <div className={styles.camOffLabel}>
                  <span>📷</span> Camera Off
                </div>
              </div>
            )}

            {/* Speaking / active ring */}
            <div className={styles.camGlow} />

            {/* Name + status bar */}
            <div className={styles.camInfo}>
              <span className={styles.camName}>
                {user?.name || 'You'} <span className={styles.youTag}>(You)</span>
                {user?.isHost && <span className={styles.hostCrown}>👑</span>}
              </span>
              <div className={styles.camStatus}>
                <span className={`${styles.micDot} ${!micEnabled ? styles.micOff : ''}`}>
                  {micEnabled ? '🎙️' : '🔇'}
                </span>
                {camEnabled && (
                  <span
                    className={styles.liveDot}
                    title={isVirtualCam ? 'Virtual Test Cam' : 'Hardware Camera Active'}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Camera controls */}
          <div className={styles.camControls}>
            {!camEnabled ? (
              <div className={styles.camStartGroup}>
                <button className={styles.btnStartCam} onClick={startCamera}>
                  📹 Enable Camera
                </button>
              </div>
            ) : (
              <div className={styles.ctrlBtns}>
                <button
                  className={`${styles.ctrlBtn} ${!micEnabled ? styles.ctrlOff : ''}`}
                  onClick={toggleMic}
                  title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {micEnabled ? '🎙️' : '🔇'}
                </button>
                <button
                  className={`${styles.ctrlBtn} ${styles.ctrlOff}`}
                  onClick={stopCamera}
                  title="Turn off camera"
                >
                  📷 Stop
                </button>
              </div>
            )}
          </div>

          {/* Error Banner with helpful Virtual Cam Fallback */}
          {camError && (
            <div className={styles.camErrorBox}>
              <p className={styles.camErrorText}>⚠️ {camError}</p>
              <button className={styles.btnVirtualCam} onClick={startVirtualCam}>
                ✨ Use Virtual Test Camera
              </button>
            </div>
          )}
        </div>

        {/* ── REAL GENUINE PEERS ONLY ── */}
        {peers.map((peer) => (
          <div key={peer.id} className={styles.camCard}>
            <div className={styles.camBox}>
              <div className={styles.camPlaceholder}>
                <span className={styles.avatarEmoji}>{peer.avatar || '👤'}</span>
                <div className={styles.genuinePeerLabel}>
                  <span>✓ Authenticated Peer</span>
                </div>
              </div>

              <div className={styles.camInfo}>
                <span className={styles.camName}>
                  {peer.name}
                  {peer.isHost && <span className={styles.hostCrown}>👑</span>}
                </span>
                <div className={styles.camStatus}>
                  <span className={styles.liveDot} />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Invite Friend Card when solo in room */}
        {peers.length === 0 && (
          <div className={`${styles.camCard} ${styles.emptySlot}`}>
            <div className={styles.camBox}>
              <div className={styles.camPlaceholder}>
                <span className={styles.inviteIcon}>👥</span>
                <div className={styles.waitingLabel}>Invite genuine friends</div>
                <button className={styles.inviteButton} onClick={copyInvite}>
                  {copied ? '✓ Link Copied!' : `🔗 Share Room Code: ${code}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
