'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

function uid(len = 5) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

const AVATARS = ['👑', '🎭', '🦊', '🐺', '🦁', '⚡', '🚀', '🎬', '🍿', '🎸'];

export default function HomePage() {
  const router = useRouter();
  const [modal, setModal] = useState(null); // 'create' | 'join'
  const [name, setName] = useState('Host');
  const [roomName, setRoom] = useState('Friday Cinema Night');
  const [code, setCode] = useState('');
  const [avatar, setAvatar] = useState('👑');
  const [error, setError] = useState('');

  function openCreate() {
    setModal('create');
    setError('');
  }
  function openJoin() {
    setModal('join');
    setError('');
  }
  function closeModal() {
    setModal(null);
    setError('');
  }

  function handleCreate(e) {
    if (e) e.preventDefault();
    const finalName = (name || '').trim() || 'Host';
    const finalRoom = (roomName || '').trim() || `${finalName}'s Cinema Room`;
    const roomCode = uid(5);
    const userData = {
      name: finalName,
      avatar: avatar || '👑',
      roomName: finalRoom,
      isHost: true,
      id: `host_${Math.random().toString(36).slice(2, 8)}`,
    };
    try {
      sessionStorage.setItem('cinesync_user', JSON.stringify(userData));
      localStorage.setItem('cinesync_user', JSON.stringify(userData));
    } catch (err) {
      console.warn('Storage write error:', err);
    }
    // Use window.location for guaranteed navigation even across origins
    window.location.href = `/room/${roomCode}`;
  }

  function handleJoin(e) {
    if (e) e.preventDefault();
    const trimmedCode = (code || '').trim();
    if (!trimmedCode || trimmedCode.length < 3) {
      return setError('Please enter a valid room passcode (e.g. XK9QZ).');
    }
    const finalName = (name || '').trim() || `Viewer_${Math.floor(Math.random() * 900 + 100)}`;
    const userData = {
      name: finalName,
      avatar: avatar || '🍿',
      roomName: 'Watch Party',
      isHost: false,
      id: `guest_${Math.random().toString(36).slice(2, 8)}`,
    };
    try {
      sessionStorage.setItem('cinesync_user', JSON.stringify(userData));
      localStorage.setItem('cinesync_user', JSON.stringify(userData));
    } catch (err) {
      console.warn('Storage write error:', err);
    }
    window.location.href = `/room/${trimmedCode.toUpperCase()}`;
  }

  return (
    <div className={styles.page}>
      {/* Background Theatre Spotlights */}
      <div className={styles.spotlightContainer}>
        <div className={styles.spotlightTop} />
        <div className={styles.spotlightAmber} />
        <div className={styles.gridOverlay} />
      </div>

      {/* Navigation Bar */}
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <div className={styles.logoBadge}>
            <span className={styles.logoDot} />
            <span className={styles.logoIcon}>🍿</span>
          </div>
          <span className={styles.logoText}>CineSync</span>
          <span className={styles.studioPill}>STUDIO</span>
        </div>

        <div className={styles.navLinks}>
          <button className={styles.btnSecondary} onClick={openJoin}>
            Enter Passcode
          </button>
          <button className={styles.btnPrimary} onClick={openCreate} title="Host a watch party">
            Host Watch Party
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className={styles.hero}>
        <div className={styles.pillBadge}>
          <span className={styles.pillDot} />
          <span>DUAL-SCREEN CINEMA • REAL-TIME WEBCAMS • STREAM YOUR WINDOW</span>
        </div>

        <h1 className={styles.title}>
          Watch Movies Together.<br />
          <span className={styles.gradientTitle}>See Every Reaction Live.</span>
        </h1>

        <p className={styles.subtitle}>
          The ultra-low-latency watch party platform. Cast any movie window, Netflix, or local video file on one screen, while viewing your group&apos;s live webcam feeds and chatting on the other.
        </p>

        <div className={styles.actions}>
          <button
            className={styles.btnHeroPrimary}
            onClick={openCreate}
            title="Instantly generate a room and start hosting"
          >
            <span>Host a Watch Party</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <button className={styles.btnHeroSecondary} onClick={openJoin}>
            <span>Join with Passcode</span>
          </button>
        </div>

        {/* Feature Specs Grid */}
        <div className={styles.featuresRow}>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>🖥️</span>
            <div>
              <h4>Cast Any Window</h4>
              <p>Stream Netflix, YouTube, VLC, or local movies directly</p>
            </div>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>📹</span>
            <div>
              <h4>Live Face Grid</h4>
              <p>See genuine live reactions with hardware echo cancellation</p>
            </div>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>⚡</span>
            <div>
              <h4>Synced Playback</h4>
              <p>Frame-accurate playback with theatre ambient glow</p>
            </div>
          </div>
        </div>

        {/* Interactive Dual-Screen Studio Mockup */}
        <div className={styles.mockupWrapper}>
          <div className={styles.mockupHeader}>
            <div className={styles.trafficLights}>
              <span className={styles.lightRed} />
              <span className={styles.lightYellow} />
              <span className={styles.lightGreen} />
            </div>
            <div className={styles.mockupAddress}>
              <span>🔒 cinesync.studio/room/DEMO</span>
            </div>
            <div className={styles.mockupLiveTag}>● 4K CINEMA LIVE</div>
          </div>

          <div className={styles.mockupScreen}>
            {/* Left Movie Player */}
            <div className={styles.mockupLeft}>
              <div className={styles.mockupVideo}>
                <div className={styles.videoAmbient} />
                <div className={styles.videoContent}>
                  <div className={styles.mockupPlayBadge}>
                    <div className={styles.playIcon}>▶</div>
                  </div>
                  <div className={styles.videoMetaOverlay}>
                    <span className={styles.streamType}>4K HDR • TAB AUDIO SYNC</span>
                    <h3>Cyberpunk: Tears of Steel</h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Face Grid & Chat */}
            <div className={styles.mockupRight}>
              <div className={styles.mockupCamGrid}>
                {[
                  { name: 'Natwar (Host)', avatar: '👑', active: true },
                  { name: 'Sarah', avatar: '🦊', active: false },
                ].map((u, i) => (
                  <div key={i} className={`${styles.mockupCam} ${u.active ? styles.mockupCamSpeaking : ''}`}>
                    <span className={styles.camAvatar}>{u.avatar}</span>
                    <div className={styles.camMeta}>
                      <span className={styles.camName}>{u.name}</span>
                      <span className={styles.camStatusDot} />
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.mockupChat}>
                <div className={styles.mockupChatHeader}>💬 Live Verified Chat</div>
                <div className={styles.mockupMsgItem}>
                  <span className={styles.mockupSender}>👑 Natwar:</span>
                  <span>Audio &amp; video streaming in full sync! 🍿</span>
                </div>
                <div className={styles.mockupMsgItem}>
                  <span className={styles.mockupSender}>Sarah:</span>
                  <span>This scene is incredible 🔥</span>
                </div>
                <div className={styles.mockupReactionPills}>
                  <span>🔥 4</span>
                  <span>🍿 2</span>
                  <span>❤️ 3</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Creation / Join Modal Overlay */}
      {modal && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={styles.modalBox}>
            <button className={styles.closeBtn} onClick={closeModal}>✕</button>
            <div className={styles.modalBadge}>
              <span className={styles.modalIcon}>{modal === 'create' ? '🎬' : '🔑'}</span>
            </div>
            <h2>{modal === 'create' ? 'Host a Watch Party' : 'Join Watch Party'}</h2>
            <p className={styles.modalSub}>
              {modal === 'create'
                ? 'Create a cinema room to stream your window and invite peers'
                : 'Enter your name and the room passcode'}
            </p>

            {error && <div className={styles.errorMsg}>⚠️ {error}</div>}

            <form onSubmit={modal === 'create' ? handleCreate : handleJoin}>
              <div className={styles.formGroup}>
                <label>Your Name / Handle</label>
                <input
                  type="text"
                  maxLength={20}
                  placeholder="e.g. Alex_Cinema"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {modal === 'create' && (
                <div className={styles.formGroup} style={{ marginTop: '10px' }}>
                  <label>Watch Party Room Name</label>
                  <input
                    type="text"
                    maxLength={30}
                    placeholder="e.g. Friday Night Movie Session"
                    value={roomName}
                    onChange={(e) => setRoom(e.target.value)}
                  />
                </div>
              )}

              {modal === 'join' && (
                <div className={styles.formGroup} style={{ marginTop: '10px' }}>
                  <label>Room Passcode</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. XK9QZ"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className={styles.codeField}
                  />
                </div>
              )}

              <div className={styles.formGroup} style={{ marginTop: '10px' }}>
                <label>Choose Avatar</label>
                <div className={styles.avatarGrid}>
                  {AVATARS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className={`${styles.avatarBtn} ${avatar === em ? styles.avatarSelected : ''}`}
                      onClick={() => setAvatar(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className={styles.btnModalPrimary}>
                {modal === 'create' ? '🚀 Enter Cinema Room' : '🔑 Join Party'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
