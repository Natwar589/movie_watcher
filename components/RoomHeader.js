'use client';
import { useState } from 'react';
import styles from './RoomHeader.module.css';

const TABS = [
  { id: 'watch',     label: 'Cinema Theatre', icon: '🎬' },
  { id: 'watchlist', label: 'Watchlist',      icon: '📋' },
  { id: 'vote',      label: 'Room Polls',     icon: '🗳️' },
];

export default function RoomHeader({ roomName, code, members = [], activeTab, onTabChange, onLeave }) {
  const [copied, setCopied] = useState(false);

  const copyInviteLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className={styles.header}>
      {/* Brand & Room Identity */}
      <div className={styles.brandGroup}>
        <div className={styles.logo}>
          <div className={styles.logoBadge}>
            <span className={styles.logoDot} />
            <span className={styles.logoIcon}>🍿</span>
          </div>
          <div className={styles.brandTextGroup}>
            <span className={styles.logoTitle}>CineSync</span>
            <span className={styles.studioTag}>STUDIO</span>
          </div>
        </div>

        <div className={styles.roomMetaDivider} />

        <div className={styles.roomTitleGroup}>
          <h1 className={styles.roomName}>{roomName}</h1>
          <button
            className={styles.codePill}
            onClick={copyInviteLink}
            title="Click to copy invite code and link"
          >
            <span className={styles.codeLabel}>PASSCODE</span>
            <span className={styles.codeVal}>{code}</span>
            <span className={styles.copyAction}>{copied ? '✓ COPIED' : 'COPY'}</span>
          </button>
        </div>
      </div>

      {/* Center Segmented Navigation */}
      <nav className={styles.tabNav}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${styles.tabBtn} ${isActive ? styles.activeTab : ''}`}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              <span className={styles.tabText}>{tab.label}</span>
              {isActive && <span className={styles.activeIndicator} />}
            </button>
          );
        })}
      </nav>

      {/* Right Action Suite */}
      <div className={styles.rightGroup}>
        {/* Facepile & Online Presence */}
        <div className={styles.memberStatusPill} title={`${members.length} verified peers connected`}>
          <span className={styles.livePulse} />
          <div className={styles.facepile}>
            {members.slice(0, 3).map((m, idx) => (
              <div
                key={m.id || idx}
                className={styles.avatarNode}
                style={{ zIndex: 10 - idx }}
                title={`${m.name} ${m.isHost ? '(Host)' : ''}`}
              >
                <span>{m.avatar || '👤'}</span>
                {m.isHost && <span className={styles.hostCrown}>👑</span>}
              </div>
            ))}
          </div>
          <span className={styles.memberCount}>
            {members.length} {members.length === 1 ? 'Peer' : 'Peers'}
          </span>
        </div>

        {/* Invite CTA Button */}
        <button className={styles.inviteBtn} onClick={copyInviteLink}>
          <span className={styles.btnIcon}>🔗</span>
          <span>{copied ? 'Copied!' : 'Invite'}</span>
        </button>

        {/* Exit Watch Party Button */}
        <button className={styles.exitBtn} onClick={onLeave} title="Exit Watch Room">
          <span>Exit</span>
        </button>
      </div>
    </header>
  );
}
