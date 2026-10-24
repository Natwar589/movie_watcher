'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './CameraGrid.module.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

/* ── Peer video element — handles attaching remote stream ── */
function PeerVideo({ peer, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className={styles.camCard}>
      <div className={styles.camBox}>
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={styles.camVideo}
          />
        ) : (
          <div className={styles.camPlaceholder}>
            <span className={styles.avatarEmoji}>{peer.avatar || '👤'}</span>
            <div className={styles.genuinePeerLabel}>
              <span className={styles.waitingDot} />
              Connecting camera…
            </div>
          </div>
        )}
        <div className={styles.camGlow} />
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
  );
}

export default function CameraGrid({ members = [], user, code, hostScreenStream, onRemoteHostStream }) {
  const localVideoRef    = useRef(null);
  const localStreamRef   = useRef(null);   // camera MediaStream
  const pcsRef           = useRef({});      // Map<peerId, RTCPeerConnection> — camera
  const screenPcsRef     = useRef({});      // Map<peerId, RTCPeerConnection> — screen share
  const pendingRef       = useRef({});
  const screenPendingRef = useRef({});
  const meRef            = useRef(user);
  meRef.current          = user;

  const [camEnabled,  setCamEnabled]  = useState(false);
  const [micEnabled,  setMicEnabled]  = useState(true);
  const [camError,    setCamError]    = useState('');
  const [isVirtualCam,setIsVirtualCam]= useState(false);
  const [copied,      setCopied]      = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({}); // Map<peerId, MediaStream>

  const animFrameRef = useRef(null);

  /* ── Signal helper: POST a targeted WebRTC message via SSE API ── */
  const signal = useCallback((to, payload) => {
    fetch(`/api/room/${code}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, to, from: meRef.current?.id }),
    }).catch(() => {});
  }, [code]);

  /* ── Screen-share specific RTCPeerConnection (host→guest one-way) ── */
  const createScreenPC = useCallback((peerId) => {
    if (screenPcsRef.current[peerId]) return screenPcsRef.current[peerId];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    screenPcsRef.current[peerId] = pc;
    screenPendingRef.current[peerId] = [];

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signal(peerId, { type: 'SCREEN_ICE', candidate });
    };

    // Guest receives the host's screen or local movie stream here
    pc.ontrack = (event) => {
      let stream = event.streams?.[0];
      if (!stream && event.track) {
        stream = new MediaStream([event.track]);
      }
      if (stream) {
        onRemoteHostStream?.(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        delete screenPcsRef.current[peerId];
      }
    };
    return pc;
  }, [signal, onRemoteHostStream]);

  /* ── When host's screen stream changes, broadcast to all guests ── */
  useEffect(() => {
    const peers = members.filter(m => !m.isMe);
    if (!hostScreenStream) {
      // Host stopped sharing — inform all guests and close screen PCs
      peers.forEach(peer => signal(peer.id, { type: 'SCREEN_STOP' }));
      Object.values(screenPcsRef.current).forEach(pc => pc.close());
      screenPcsRef.current = {};
      return;
    }
    // Host is sharing — send offers to all current guests
    peers.forEach(async (peer) => {
      if (screenPcsRef.current[peer.id]) {
        const existingPc = screenPcsRef.current[peer.id];
        if (existingPc.connectionState === 'connected' || existingPc.connectionState === 'connecting') return;
        existingPc.close();
        delete screenPcsRef.current[peer.id];
      }
      const pc = createScreenPC(peer.id);
      hostScreenStream.getTracks().forEach(track => {
        const existing = pc.getSenders().find(s => s.track?.id === track.id);
        if (!existing) pc.addTrack(track, hostScreenStream);
      });
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal(peer.id, { type: 'SCREEN_OFFER', sdp: pc.localDescription });
      } catch (err) {
        console.warn('SCREEN_OFFER create error:', err);
      }
    });
  }, [hostScreenStream, members, createScreenPC, signal]);

  /* ── Create RTCPeerConnection for a peer ── */
  const createPC = useCallback((peerId, polite) => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[peerId] = pc;
    pendingRef.current[peerId] = [];

    // Add local tracks if camera is on
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Receive remote video stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
      setRemoteStreams(prev => ({ ...prev, [peerId]: remoteStream }));
    };

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        signal(peerId, { type: 'ICE', candidate });
      }
    };

    // Negotiation needed (called when tracks are added)
    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal(peerId, { type: 'OFFER', sdp: pc.localDescription });
      } catch (err) {
        console.warn('Negotiation error:', err);
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        delete pcsRef.current[peerId];
      }
    };

    return pc;
  }, [signal]);

  /* ── Handle incoming WebRTC signaling messages ── */
  const handleSignal = useCallback(async (data) => {
    const { type, from, to, sdp, candidate } = data;
    if (!from || from === meRef.current?.id) return;
    if (to && to !== meRef.current?.id) return;

    // ── Camera peer connections ──
    if (type === 'OFFER') {
      const pc = createPC(from, false);
      try {
        if (pc.signalingState !== 'stable') {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }).catch(() => {}),
            pc.setRemoteDescription(new RTCSessionDescription(sdp)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        for (const c of (pendingRef.current[from] || [])) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingRef.current[from] = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal(from, { type: 'ANSWER', sdp: pc.localDescription });
      } catch (err) {
        console.warn('OFFER handling error:', err);
      }
    } else if (type === 'ANSWER') {
      const pc = pcsRef.current[from];
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          for (const c of (pendingRef.current[from] || [])) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingRef.current[from] = [];
        } catch (err) {
          console.warn('ANSWER handling error:', err);
        }
      }
    } else if (type === 'ICE') {
      const pc = pcsRef.current[from];
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        if (!pendingRef.current[from]) pendingRef.current[from] = [];
        pendingRef.current[from].push(candidate);
      }
    }

    // ── Screen share peer connections (guest receives host screen) ──
    else if (type === 'SCREEN_OFFER') {
      const pc = createScreenPC(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const c of (screenPendingRef.current[from] || [])) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        screenPendingRef.current[from] = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal(from, { type: 'SCREEN_ANSWER', sdp: pc.localDescription });
      } catch (err) {
        console.warn('SCREEN_OFFER handling error:', err);
      }
    } else if (type === 'SCREEN_ANSWER') {
      const pc = screenPcsRef.current[from];
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          for (const c of (screenPendingRef.current[from] || [])) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          screenPendingRef.current[from] = [];
        } catch (err) {
          console.warn('SCREEN_ANSWER handling error:', err);
        }
      }
    } else if (type === 'SCREEN_ICE') {
      const pc = screenPcsRef.current[from];
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        if (!screenPendingRef.current[from]) screenPendingRef.current[from] = [];
        screenPendingRef.current[from].push(candidate);
      }
    } else if (type === 'SCREEN_STOP') {
      if (screenPcsRef.current[from]) {
        screenPcsRef.current[from].close();
        delete screenPcsRef.current[from];
      }
      onRemoteHostStream?.(null);
    }
  }, [createPC, createScreenPC, signal, onRemoteHostStream]);

  /* ── Subscribe to SSE room events (includes WebRTC signals) ── */
  useEffect(() => {
    if (!code || !user?.id) return;

    const es = new EventSource(`/api/room/${code}/events?peerId=${user.id}`);

    es.onmessage = async (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data?.type) return;

      if (['OFFER', 'ANSWER', 'ICE', 'SCREEN_OFFER', 'SCREEN_ANSWER', 'SCREEN_ICE', 'SCREEN_STOP'].includes(data.type)) {
        await handleSignal(data);
      }
    };

    return () => es.close();
  }, [code, user?.id, handleSignal]);

  /* ── When a new member joins, initiate WebRTC call TO them ── */
  useEffect(() => {
    const peers = members.filter(m => !m.isMe);
    peers.forEach(peer => {
      if (!pcsRef.current[peer.id]) {
        // We are the "impolite" peer — we initiate the offer
        const pc = createPC(peer.id, true);
        // Add local tracks to trigger onnegotiationneeded
        if (localStreamRef.current && pc.getSenders().length === 0) {
          localStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current);
          });
        }
      }
    });
  }, [members, createPC]);

  /* ── Start real hardware camera ── */
  const startCamera = useCallback(async () => {
    setCamError('');
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCamError('Camera requires a secure HTTPS connection or localhost.');
      return;
    }
    try {
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setMicEnabled(false);
      }

      localStreamRef.current = s;
      setCamEnabled(true);
      setIsVirtualCam(false);
      setCamError('');

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = s;
        localVideoRef.current.play().catch(() => {});
      }

      // Add tracks to all existing peer connections and offer immediately
      Object.entries(pcsRef.current).forEach(async ([peerId, pc]) => {
        s.getTracks().forEach(track => {
          const senders = pc.getSenders();
          if (!senders.find(sd => sd.track?.kind === track.kind)) {
            pc.addTrack(track, s);
          }
        });
        try {
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signal(peerId, { type: 'OFFER', sdp: pc.localDescription });
          }
        } catch {}
      });

      // Create new PCs for all current peers and send offers
      const peers = members.filter(m => !m.isMe);
      peers.forEach(peer => {
        const pc = createPC(peer.id, true);
        if (pc.getSenders().length === 0) {
          s.getTracks().forEach(track => pc.addTrack(track, s));
        }
      });

    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCamError('Camera permission denied. Click the camera icon in your address bar to allow access.');
      } else if (err.name === 'NotFoundError') {
        setCamError('No webcam found on this device.');
      } else if (err.name === 'NotReadableError') {
        setCamError('Webcam is in use by another app (e.g. Zoom, FaceTime).');
      } else {
        setCamError(`Could not start camera: ${err.message}`);
      }
    }
  }, [members, createPC, signal]);

  /* ── Virtual test camera (canvas-based) ── */
  const startVirtualCam = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      let hue = 0;

      const drawFrame = () => {
        hue = (hue + 1) % 360;
        const grad = ctx.createLinearGradient(0, 0, 320, 240);
        grad.addColorStop(0, `hsl(${hue}, 60%, 20%)`);
        grad.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 10%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 320, 240);

        const radius = 35 + Math.sin(Date.now() / 300) * 8;
        ctx.beginPath();
        ctx.arc(160, 100, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99,102,241,0.35)';
        ctx.fill();
        ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2; ctx.stroke();

        ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(user?.avatar || '👤', 160, 100);

        ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${user?.name || 'You'} (Virtual)`, 160, 160);
        ctx.font = '10px monospace'; ctx.fillStyle = '#34d399';
        ctx.fillText(`● ${new Date().toLocaleTimeString()}`, 160, 185);

        animFrameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const vStream = canvas.captureStream(30);
      localStreamRef.current = vStream;
      setIsVirtualCam(true);
      setCamEnabled(true);
      setCamError('');

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = vStream;
        localVideoRef.current.play().catch(() => {});
      }

      // Share virtual stream with existing peers and offer immediately
      Object.entries(pcsRef.current).forEach(async ([peerId, pc]) => {
        vStream.getTracks().forEach(track => {
          if (!pc.getSenders().find(s => s.track?.kind === track.kind)) {
            pc.addTrack(track, vStream);
          }
        });
        try {
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signal(peerId, { type: 'OFFER', sdp: pc.localDescription });
          }
        } catch {}
      });
    } catch (e) {
      setCamError('Virtual camera error: ' + e.message);
    }
  }, [user]);

  const stopCamera = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setCamEnabled(false);
    setIsVirtualCam(false);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audio = localStreamRef.current.getAudioTracks();
      if (audio.length) {
        audio.forEach(t => { t.enabled = !t.enabled; });
        setMicEnabled(p => !p);
      } else {
        alert('No microphone active on this stream.');
      }
    }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      Object.values(pcsRef.current).forEach(pc => pc.close());
    };
  }, []);

  const peers      = members.filter(m => !m.isMe);
  const totalSlots = members.length;
  const gridCols   = totalSlots <= 2 ? 2 : totalSlots <= 4 ? 2 : 3;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <span className={styles.headerTitle}>📹 Room Cameras</span>
          <span className={styles.verifiedTag}>Live WebRTC</span>
        </div>
        <span className={styles.onlineBadge}>
          {members.length} Active Member{members.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.grid} style={{ '--cols': gridCols }}>
        {/* ── MY CAMERA ── */}
        <div className={`${styles.camCard} ${styles.myCard}`}>
          <div className={styles.camBox}>
            <video
              ref={localVideoRef}
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
            <div className={styles.camGlow} />
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
                  <span className={styles.liveDot} title={isVirtualCam ? 'Virtual Test Cam' : 'Hardware Camera'} />
                )}
              </div>
            </div>
          </div>

          <div className={styles.camControls}>
            {!camEnabled ? (
              <div className={styles.camStartGroup}>
                <button className={styles.btnStartCam} onClick={startCamera}>
                  📹 Enable Camera
                </button>
                <button className={styles.btnVirtualCamSmall} onClick={startVirtualCam}>
                  ✨ Virtual Cam
                </button>
              </div>
            ) : (
              <div className={styles.ctrlBtns}>
                <button
                  className={`${styles.ctrlBtn} ${!micEnabled ? styles.ctrlOff : ''}`}
                  onClick={toggleMic}
                  title={micEnabled ? 'Mute' : 'Unmute'}
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

          {camError && (
            <div className={styles.camErrorBox}>
              <p className={styles.camErrorText}>⚠️ {camError}</p>
              <button className={styles.btnVirtualCam} onClick={startVirtualCam}>
                ✨ Use Virtual Test Camera
              </button>
            </div>
          )}
        </div>

        {/* ── REMOTE PEERS with live WebRTC video ── */}
        {peers.map(peer => (
          <PeerVideo
            key={peer.id}
            peer={peer}
            stream={remoteStreams[peer.id] || null}
          />
        ))}

        {/* ── Invite card when solo ── */}
        {peers.length === 0 && (
          <div className={`${styles.camCard} ${styles.emptySlot}`}>
            <div className={styles.camBox}>
              <div className={styles.camPlaceholder}>
                <span className={styles.inviteIcon}>👥</span>
                <div className={styles.waitingLabel}>Share the room code to invite friends!</div>
                <button className={styles.inviteButton} onClick={copyInvite}>
                  {copied ? '✓ Link Copied!' : `🔗 Copy Room Link · ${code}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
