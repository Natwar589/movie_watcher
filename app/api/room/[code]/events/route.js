/**
 * SSE-based real-time room sync + WebRTC signaling API
 * GET /api/room/[code]/events  – subscribe (SSE stream)
 * POST /api/room/[code]/events – broadcast OR targeted event
 */

export const dynamic = 'force-dynamic';

const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { clients: new Map(), peers: new Map() });
    // Map<peerId, controller> for targeted WebRTC signaling
  }
  return rooms.get(code);
}

function broadcast(room, data, excludePeerId = null) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const [peerId, ctrl] of room.clients) {
    if (peerId === excludePeerId) continue;
    try {
      ctrl.enqueue(new TextEncoder().encode(msg));
    } catch {
      room.clients.delete(peerId);
    }
  }
}

function sendTo(room, targetPeerId, data) {
  const ctrl = room.clients.get(targetPeerId);
  if (!ctrl) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  try {
    ctrl.enqueue(new TextEncoder().encode(msg));
  } catch {
    room.clients.delete(targetPeerId);
  }
}

export async function GET(request, { params }) {
  const { code } = await params;
  const room = getRoom(code);

  // Caller must pass ?peerId= so server can map them for targeted messages
  const url = new URL(request.url);
  const peerId = url.searchParams.get('peerId') || `anon_${Math.random().toString(36).slice(2, 8)}`;

  let controller;
  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      room.clients.set(peerId, controller);

      // Send current peer list immediately on connect
      const peers = Array.from(room.peers.values());
      const hello = `data: ${JSON.stringify({ type: 'ROOM_STATE', peers })}\n\n`;
      controller.enqueue(new TextEncoder().encode(hello));

      // Keepalive ping every 20s
      const ping = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 20000);

      request.signal.addEventListener('abort', () => {
        clearInterval(ping);
        room.clients.delete(peerId);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      room.clients.delete(peerId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(request, { params }) {
  const { code } = await params;
  const room = getRoom(code);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const { type, peer, peerId, to, text, sender, url, title, senderName } = body;

  // Targeted WebRTC signaling messages (offer / answer / ice-candidate)
  if (to) {
    sendTo(room, to, body);
    return new Response('OK', { status: 200 });
  }

  // Broadcast messages
  if (type === 'PEER_JOIN' && peer) {
    room.peers.set(peer.id, peer);
    broadcast(room, { type: 'PEER_JOIN', peer }, peer.id);
  } else if (type === 'PEER_LEAVE' && peerId) {
    room.peers.delete(peerId);
    broadcast(room, { type: 'PEER_LEAVE', peerId, name: body.name });
  } else if (type === 'PEER_CHAT' && sender && text) {
    broadcast(room, { type: 'PEER_CHAT', sender, text }, sender.id);
  } else if (type === 'MEDIA_UPDATE' && url) {
    broadcast(room, { type: 'MEDIA_UPDATE', url, title, senderName });
  } else {
    broadcast(room, body);
  }

  return new Response('OK', { status: 200 });
}
