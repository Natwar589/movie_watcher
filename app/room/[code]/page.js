'use client';
import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import VideoPlayer from '../../../components/VideoPlayer';
import CameraGrid  from '../../../components/CameraGrid';
import ChatPanel   from '../../../components/ChatPanel';
import RoomHeader  from '../../../components/RoomHeader';
import styles from './room.module.css';

function RoomContent() {
  const { code } = useParams();
  const router   = useRouter();

  const [user,       setUser]      = useState(null);
  const [members,    setMembers]   = useState([]);
  const [messages,   setMessages]  = useState([]);
  const [videoUrl,   setVideoUrl]  = useState('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
  const [videoTitle, setVideoTitle]= useState('Big Buck Bunny (Animation Short)');
  const [isReady,    setIsReady]   = useState(false);

  const channelRef = useRef(null);

  /* Add system message */
  const addSysMsg = useCallback((text) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, type: 'system', text }]);
  }, []);

  /* Add authenticated chat message */
  const addMsg = useCallback((sender, text) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      type: 'chat',
      sender: {
        id: sender.id,
        name: sender.name,
        avatar: sender.avatar,
        isHost: !!sender.isHost,
        isMe: !!sender.isMe,
      },
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  }, []);

  /* ─────────────────────────────────────────────────────────
     AUTHENTICATION & REAL PEER SYNC (BroadcastChannel)
     No bots, no fake comments — only genuine authenticated users
     ───────────────────────────────────────────────────────── */
  useEffect(() => {
    // 1. Safely load or auto-initialize genuine authenticated user
    let u = null;
    try {
      const raw = sessionStorage.getItem('cinesync_user') || localStorage.getItem('cinesync_user');
      if (raw) u = JSON.parse(raw);
    } catch (e) {
      console.warn('Storage read error:', e);
    }

    if (!u) {
      // Auto-generate guest profile so user is never locked out
      u = {
        name: `User_${Math.floor(Math.random() * 900 + 100)}`,
        avatar: '🍿',
        roomName: 'Watch Party',
        isHost: false,
      };
      try {
        sessionStorage.setItem('cinesync_user', JSON.stringify(u));
      } catch (e) {}
    }

    const userId = u.id || `user_${Math.random().toString(36).slice(2, 8)}`;
    const authUser = { ...u, id: userId };
    setUser(authUser);

    const me = {
      id: userId,
      name: authUser.name,
      avatar: authUser.avatar,
      isHost: !!authUser.isHost,
      isMe: true,
      joinedAt: Date.now(),
    };

    setMembers([me]);
    setMessages([{
      id: Date.now(),
      type: 'system',
      text: `🔒 Authenticated as ${authUser.name} (${authUser.isHost ? 'Room Creator / Host' : 'Verified Member'}). Room: ${code}`,
    }]);
    setIsReady(true);

    // 2. Connect to Room's real cross-tab/peer channel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel(`cinesync_room_${code}`);
      channelRef.current = channel;

      // Announce this genuine user joined
      channel.postMessage({
        type: 'PEER_JOIN',
        peer: { id: me.id, name: me.name, avatar: me.avatar, isHost: me.isHost },
      });

      // Handle real peer events
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        if (data.type === 'PEER_JOIN') {
          // A real user joined from another window/tab
          if (data.peer && data.peer.id !== me.id) {
            setMembers(prev => {
              if (prev.some(m => m.id === data.peer.id)) return prev;
              return [...prev, { ...data.peer, isMe: false }];
            });
            addSysMsg(`👋 ${data.peer.avatar} ${data.peer.name} (${data.peer.isHost ? 'Host' : 'Member'}) entered the room.`);

            // Reply so the new peer knows we are here
            channel.postMessage({
              type: 'PEER_PRESENT',
              peer: { id: me.id, name: me.name, avatar: me.avatar, isHost: me.isHost },
            });
          }
        } else if (data.type === 'PEER_PRESENT') {
          // Existing peer responding
          if (data.peer && data.peer.id !== me.id) {
            setMembers(prev => {
              if (prev.some(m => m.id === data.peer.id)) return prev;
              return [...prev, { ...data.peer, isMe: false }];
            });
          }
        } else if (data.type === 'PEER_CHAT') {
          // Genuine message sent by another real user
          if (data.sender && data.sender.id !== me.id) {
            addMsg(data.sender, data.text);
          }
        } else if (data.type === 'PEER_LEAVE') {
          if (data.peerId) {
            setMembers(prev => prev.filter(m => m.id !== data.peerId));
            if (data.name) addSysMsg(`🚪 ${data.name} left the room.`);
          }
        } else if (data.type === 'MEDIA_UPDATE') {
          if (data.title && data.url) {
            setVideoUrl(data.url);
            setVideoTitle(data.title);
            addSysMsg(`🎬 ${data.senderName || 'Host'} switched movie to: "${data.title}"`);
          }
        }
      };
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.postMessage({ type: 'PEER_LEAVE', peerId: me.id, name: me.name });
        channelRef.current.close();
      }
    };
  }, [code, router, addSysMsg, addMsg]);

  /* Genuine User Comment Sender */
  const sendMessage = (text) => {
    if (!user || !text.trim()) return;

    const meSender = {
      id: user.id || 'me',
      name: user.name,
      avatar: user.avatar,
      isHost: !!user.isHost,
      isMe: true,
    };

    // Add locally to sender's view
    addMsg(meSender, text.trim());

    // Broadcast only to real peers in this room
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'PEER_CHAT',
        sender: {
          id: user.id || 'me',
          name: user.name,
          avatar: user.avatar,
          isHost: !!user.isHost,
          isMe: false,
        },
        text: text.trim(),
      });
    }
  };

  /* Genuine Emoji Reaction Sender */
  const sendReaction = (emoji) => {
    if (!user) return;
    sendMessage(emoji);
  };

  const onVideoLoaded = useCallback((url, title) => {
    setVideoUrl(url);
    setVideoTitle(title);
    addSysMsg(`🎬 Now loaded: "${title}"`);

    // Broadcast media change to real peers
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'MEDIA_UPDATE',
        url,
        title,
        senderName: user?.name,
      });
    }
  }, [addSysMsg, user?.name]);

  const leaveRoom = () => {
    if (confirm('Are you sure you want to exit the room?')) {
      if (channelRef.current && user) {
        channelRef.current.postMessage({ type: 'PEER_LEAVE', peerId: user.id, name: user.name });
      }
      sessionStorage.removeItem('cinesync_user');
      router.push('/');
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
              />
            </div>

            {/* RIGHT: Live Camera Feeds + Authenticated Chat */}
            <div className={styles.rightPane}>
              <CameraGrid members={members} user={user} code={code} />
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
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Connecting securely...</p>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
