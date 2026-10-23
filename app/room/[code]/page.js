'use client';
import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useParams } from 'next/navigation';
import VideoPlayer from '../../../components/VideoPlayer';
import CameraGrid  from '../../../components/CameraGrid';
import ChatPanel   from '../../../components/ChatPanel';
import RoomHeader  from '../../../components/RoomHeader';
import styles from './room.module.css';

function RoomContent() {
  const { code } = useParams();

  const [user,       setUser]      = useState(null);
  const [members,    setMembers]   = useState([]);
  const [messages,   setMessages]  = useState([]);
  const [videoUrl,   setVideoUrl]  = useState('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
  const [videoTitle, setVideoTitle]= useState('Big Buck Bunny (Animation Short)');
  const [isReady,    setIsReady]   = useState(false);
  const [activeTab,  setActiveTab] = useState('watch');
  // Screen share streaming: host -> guests
  const [hostScreenStream,   setHostScreenStream]   = useState(null); // host's getDisplayMedia stream
  const [remoteHostStream,   setRemoteHostStream]   = useState(null); // guest receives host screen

  const meRef    = useRef(null); // current user info ref (avoids stale closures)
  const sseRef   = useRef(null); // EventSource ref

  /* ─── Helpers ─── */
  const addSysMsg = useCallback((text) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, type: 'system', text }]);
  }, []);

  const addMsg = useCallback((sender, text) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      type: 'chat',
      sender: { id: sender.id, name: sender.name, avatar: sender.avatar, isHost: !!sender.isHost, isMe: !!sender.isMe },
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  }, []);

  /* ─── POST helper to broadcast events to all room members ─── */
  const broadcast = useCallback((payload) => {
    fetch(`/api/room/${code}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [code]);

  /* ─── Bootstrap: load user, connect SSE ─── */
  useEffect(() => {
    if (!code) return;

    // 1. Load or auto-generate authenticated user
    let u = null;
    try {
      const rawSession = sessionStorage.getItem('cinesync_user');
      if (rawSession) {
        u = JSON.parse(rawSession);
      } else {
        const rawLocal = localStorage.getItem('cinesync_user');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          // Distinct tab opening room: assign fresh unique guest identity to prevent peer ID collision
          u = {
            name: `Viewer_${Math.floor(Math.random() * 900 + 100)}`,
            avatar: '🍿',
            roomName: parsed.roomName || 'Watch Party',
            isHost: false,
            id: `guest_${Math.random().toString(36).slice(2, 8)}`,
          };
          try { sessionStorage.setItem('cinesync_user', JSON.stringify(u)); } catch {}
        }
      }
    } catch {}

    if (!u) {
      u = {
        name: `Viewer_${Math.floor(Math.random() * 900 + 100)}`,
        avatar: '🍿',
        roomName: 'Watch Party',
        isHost: false,
        id: `guest_${Math.random().toString(36).slice(2, 8)}`,
      };
      try { sessionStorage.setItem('cinesync_user', JSON.stringify(u)); } catch {}
    }

    const userId = u.id || `user_${Math.random().toString(36).slice(2, 8)}`;
    const authUser = { ...u, id: userId };
    setUser(authUser);

    const me = {
      id: userId,
      name: authUser.name,
      avatar: authUser.avatar,
      isHost: !!authUser.isHost,
      joinedAt: Date.now(),
    };
    meRef.current = me;

    // Add self immediately
    setMembers([{ ...me, isMe: true }]);
    setMessages([{
      id: Date.now(),
      type: 'system',
      text: `🔒 Joined as ${authUser.name} (${authUser.isHost ? 'Host' : 'Member'}) · Room: ${code}`,
    }]);
    setIsReady(true);

    // 2. Connect to SSE stream
    const es = new EventSource(`/api/room/${code}/events?peerId=${userId}_page`);
    sseRef.current = es;

    es.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data?.type) return;

      if (data.type === 'ROOM_STATE') {
        // Server sends current peers when we connect
        const peers = (data.peers || []).filter(p => p.id !== me.id);
        setMembers(prev => {
          const existing = new Set(prev.map(m => m.id));
          const newPeers = peers.filter(p => !existing.has(p.id)).map(p => ({ ...p, isMe: false }));
          return [...prev, ...newPeers];
        });
        if (peers.length > 0) {
          addSysMsg(`👥 ${peers.length} member(s) already in room.`);
        }
      } else if (data.type === 'PEER_JOIN') {
        if (data.peer?.id && data.peer.id !== me.id) {
          setMembers(prev => {
            if (prev.some(m => m.id === data.peer.id)) return prev;
            return [...prev, { ...data.peer, isMe: false }];
          });
          addSysMsg(`👋 ${data.peer.avatar} ${data.peer.name} joined the room.`);
        }
      } else if (data.type === 'PEER_LEAVE') {
        if (data.peerId && data.peerId !== me.id) {
          setMembers(prev => prev.filter(m => m.id !== data.peerId));
          if (data.name) addSysMsg(`🚪 ${data.name} left the room.`);
        }
      } else if (data.type === 'PEER_CHAT') {
        if (data.sender?.id !== me.id) {
          addMsg(data.sender, data.text);
        }
      } else if (data.type === 'MEDIA_UPDATE') {
        if (data.title && data.url) {
          setVideoUrl(data.url);
          setVideoTitle(data.title);
          addSysMsg(`🎬 ${data.senderName || 'Host'} switched to: "${data.title}"`);
        }
      }
    };

    es.onerror = () => {
      // SSE auto-reconnects; silently handle
    };

    // 3. Announce join to ALL members (including other devices/browsers)
    fetch(`/api/room/${code}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PEER_JOIN', peer: { id: me.id, name: me.name, avatar: me.avatar, isHost: me.isHost } }),
    }).catch(() => {});

    // 4. Cleanup on leave
    const handleUnload = () => {
      navigator.sendBeacon(`/api/room/${code}/events`,
        new Blob([JSON.stringify({ type: 'PEER_LEAVE', peerId: me.id, name: me.name })],
          { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      es.close();
      fetch(`/api/room/${code}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PEER_LEAVE', peerId: me.id, name: me.name }),
      }).catch(() => {});
    };
  }, [code, addSysMsg, addMsg]);

  /* ─── Send chat message ─── */
  const sendMessage = (text) => {
    if (!user || !text.trim()) return;
    const me = meRef.current;
    const sender = { id: me.id, name: me.name, avatar: me.avatar, isHost: !!me.isHost, isMe: true };

    // Add locally first
    addMsg(sender, text.trim());

    // Broadcast to others
    broadcast({ type: 'PEER_CHAT', sender: { ...sender, isMe: false }, text: text.trim() });
  };

  const sendReaction = (emoji) => {
    if (!user) return;
    sendMessage(emoji);
  };

  const onVideoLoaded = useCallback((url, title) => {
    setVideoUrl(url);
    setVideoTitle(title);
    addSysMsg(`🎬 Now loaded: "${title}"`);
    broadcast({ type: 'MEDIA_UPDATE', url, title, senderName: user?.name });
  }, [addSysMsg, user?.name, broadcast]);

  const leaveRoom = () => {
    if (confirm('Are you sure you want to exit the room?')) {
      const me = meRef.current;
      if (me) {
        fetch(`/api/room/${code}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'PEER_LEAVE', peerId: me.id, name: me.name }),
        }).catch(() => {});
      }
      sessionStorage.removeItem('cinesync_user');
      window.location.href = '/';
    }
  };

  if (!isReady || !user) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Authenticating user session...</p>
      </div>
    );
  }

  return (
    <div className={styles.roomPage}>
      <RoomHeader
        roomName={user.roomName || `${user.name}'s Room`}
        code={code}
        members={members}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLeave={leaveRoom}
      />

      <div className={styles.roomBody}>
        {activeTab === 'watch' && (
          <div className={styles.watchLayout}>
            {/* LEFT: Video Player / Host Window Stream */}
            <div className={styles.leftPane}>
              <VideoPlayer
                url={videoUrl}
                title={videoTitle}
                onLoaded={onVideoLoaded}
                user={user}
                members={members}
                onSysMsg={addSysMsg}
                onScreenShare={setHostScreenStream}
                remoteHostStream={remoteHostStream}
              />
            </div>

            {/* RIGHT: Live Camera Feeds + Authenticated Chat */}
            <div className={styles.rightPane}>
              <CameraGrid
                members={members}
                user={user}
                code={code}
                hostScreenStream={hostScreenStream}
                onRemoteHostStream={setRemoteHostStream}
              />
              <ChatPanel
                messages={messages}
                onSend={sendMessage}
                onReaction={sendReaction}
                user={user}
              />
            </div>
          </div>
        )}

        {activeTab !== 'watch' && (
          <div className={styles.comingSoon}>
            <div className={styles.csIcon}>
              {activeTab === 'watchlist' && '📋'}
              {activeTab === 'vote'      && '🗳️'}
              {activeTab === 'schedule'  && '📅'}
            </div>
            <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
            <p>Switch to <strong>Watch Room</strong> to enjoy synced playback with your group.</p>
            <button className={styles.btnBack} onClick={() => setActiveTab('watch')}>← Back to Watch</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080c14', color:'#fff', flexDirection:'column', gap:'16px' }}>
          <div style={{ width:'40px', height:'40px', border:'3px solid rgba(255,255,255,0.1)', borderTopColor:'#7c3aed', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <p>Connecting securely...</p>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
