'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './ChatPanel.module.css';

const REACTIONS = ['😂', '😱', '❤️', '🔥', '👏', '🍿', '🤯', '🎬'];

export default function ChatPanel({ messages, onSend, onReaction, user }) {
  const [input, setInput] = useState('');
  const [floaters, setFloaters] = useState([]);
  const messagesEndRef = useRef(null);

  /* Auto-scroll to bottom */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    if (!user) return;
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleReaction(emoji) {
    if (!user) return;
    onReaction(emoji);
    // Spawn floating emoji
    const id = `${Date.now()}-${Math.random()}`;
    setFloaters((prev) => [...prev, { id, emoji, x: Math.random() * 60 - 30 }]);
    setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== id)), 2500);
  }

  const isAuthenticated = Boolean(user && user.name);

  return (
    <div className={styles.panel}>
      {/* Header with Authenticated Badge */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>💬 Room Chat</h3>
          <span className={styles.authBadge} title="Only genuine, authenticated users in this room can comment">
            🔒 Verified Users Only
          </span>
        </div>
        <span className={styles.liveTag}>LIVE</span>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.map((msg) => {
          if (msg.type === 'system') {
            return (
              <div key={msg.id} className={styles.sysMsg}>
                {msg.text}
              </div>
            );
          }

          const isOwn = msg.sender?.isMe;
          const isEmoji = /^\p{Emoji}/u.test(msg.text) && msg.text.trim().length <= 4;

          return (
            <div key={msg.id} className={`${styles.msg} ${isOwn ? styles.msgOwn : ''}`}>
              {!isOwn && (
                <div className={styles.msgAvatar}>
                  {msg.sender?.avatar || '👤'}
                </div>
              )}
              <div className={styles.msgBody}>
                <div className={styles.msgMetaHeader}>
                  <span className={styles.msgName}>
                    {isOwn ? 'You' : msg.sender?.name}
                  </span>
                  {msg.sender?.isHost && <span className={styles.hostBadge}>👑 Host</span>}
                  <span className={styles.verifiedCheck} title="Authenticated genuine room member">✓</span>
                </div>

                <div
                  className={`${styles.msgBubble} ${isOwn ? styles.bubbleOwn : ''} ${
                    isEmoji ? styles.bubbleEmoji : ''
                  }`}
                >
                  {msg.text}
                </div>
                <div className={`${styles.msgTime} ${isOwn ? styles.timeOwn : ''}`}>
                  {msg.time}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 1-Tap Emoji Reactions (Genuine Users Only) */}
      <div className={styles.reactions}>
        {REACTIONS.map((em) => (
          <button
            key={em}
            className={styles.reactionBtn}
            onClick={() => handleReaction(em)}
            disabled={!isAuthenticated}
            title={isAuthenticated ? `Send ${em}` : 'Sign in to react'}
          >
            {em}
          </button>
        ))}
      </div>

      {/* Active User Indicator */}
      <div className={styles.senderPill}>
        {isAuthenticated ? (
          <span className={styles.authenticatedText}>
            Commenting as <strong className={styles.senderName}>{user.avatar} {user.name}</strong>
            {user.isHost ? ' (Host)' : ' (Member)'}
          </span>
        ) : (
          <span className={styles.unauthenticatedText}>
            ⚠️ Sign in to participate in the conversation
          </span>
        )}
      </div>

      {/* Input Area */}
      <div className={styles.inputArea}>
        <input
          className={styles.chatInput}
          type="text"
          placeholder={isAuthenticated ? "Type a message..." : "Join room to send messages..."}
          maxLength={300}
          value={input}
          disabled={!isAuthenticated}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!isAuthenticated || !input.trim()}
          title="Send comment"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {/* Floating emoji reactions */}
      <div className={styles.floatingLayer}>
        {floaters.map((f) => (
          <span key={f.id} className={styles.floatEmoji} style={{ left: `calc(50% + ${f.x}px)` }}>
            {f.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}
