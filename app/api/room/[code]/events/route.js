/**
 * SSE-based real-time room sync API
 * GET /api/room/[code]/events  – subscribe (SSE stream)
 * POST /api/room/[code]/events – broadcast event to all members
 */

// In-memory room state (lives as long as the server process lives)
// Map<roomCode, { clients: Set<ReadableStreamController>, peers: Map<peerId, peerInfo> }>
const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { clients: new Set(), peers: new Map() });
  }
  return rooms.get(code);
}

function broadcast(room, data, excludeController = null) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const ctrl of room.clients) {
    if (ctrl === excludeController) continue;
    try {
      ctrl.enqueue(new TextEncoder().encode(msg));
    } catch {
      room.clients.delete(ctrl);
    }
  }
}

export async function GET(request, { params }) {
  const { code } = await params;
  const room = getRoom(code);

  let controller;
  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      room.clients.add(controller);

      // Send current peer list immediately on connect
      const peers = Array.from(room.peers.values());
      const hello = `data: ${JSON.stringify({ type: 'ROOM_STATE', peers })}\n\n`;
      controller.enqueue(new TextEncoder().encode(hello));

      // Keepalive ping every 20 seconds
      const ping = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 20000);

      request.signal.addEventListener('abort', () => {
        clearInterval(ping);
        room.clients.delete(controller);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      room.clients.delete(controller);
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

  const { type, peer, peerId, text, sender, url, title, senderName } = body;

  if (type === 'PEER_JOIN' && peer) {
    room.peers.set(peer.id, peer);
    broadcast(room, { type: 'PEER_JOIN', peer });
  } else if (type === 'PEER_LEAVE' && peerId) {
    room.peers.delete(peerId);
    broadcast(room, { type: 'PEER_LEAVE', peerId, name: body.name });
  } else if (type === 'PEER_CHAT' && sender && text) {
    broadcast(room, { type: 'PEER_CHAT', sender, text });
  } else if (type === 'MEDIA_UPDATE' && url) {
    broadcast(room, { type: 'MEDIA_UPDATE', url, title, senderName });
  } else {
    broadcast(room, body);
  }

  return new Response('OK', { status: 200 });
}
