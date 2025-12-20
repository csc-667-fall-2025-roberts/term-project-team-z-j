import { query } from '../database';

// Special room ID for lobby chat (0 = lobby, any other number = game room)
export const LOBBY_ROOM_ID = 0;

// Send a message
export async function sendMessage(req: any, res: any) {
  const roomId = parseInt(req.params.roomId);
  const content = req.body.content;

  // Get authenticated user from session
  const user = req.session?.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const senderId = user.id;
  const username = user.username;

  try {
    // Basic checks
    if (!content || content.trim() === '') {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    if (content.length > 500) {
      res.status(400).json({ error: 'Message too long' });
      return;
    }

    // For game rooms (not lobby), verify user is a player in the game
    if (roomId !== LOBBY_ROOM_ID) {
      const playerCheck = await query(
        `SELECT user_id FROM room_players WHERE room_id = $1 AND user_id = $2`,
        [roomId, senderId]
      );

      if (playerCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a player in this game' });
        return;
      }
    }

    // Save message to database
    // For lobby (room_id = 0), store as NULL since there's no game_room with id 0
    const dbRoomId = roomId === LOBBY_ROOM_ID ? null : roomId;

    const result = await query(
      `INSERT INTO messages (room_id, sender_id, message_type, content, created_at) 
       VALUES ($1, $2, 'chat', $3, NOW())
       RETURNING id, room_id, sender_id, message_type, content, created_at`,
      [dbRoomId, senderId, content.trim()]
    );

    const newMessage = result.rows[0];

    // Send success response
    res.status(202).json({
      success: true,
      message_id: newMessage.id
    });

    // Broadcast to everyone in the room (Socket.IO)
    const io = req.app.get('io');
    if (io) {
      const roomName = roomId === LOBBY_ROOM_ID ? 'lobby' : `room:${roomId}`;
      io.to(roomName).emit('room:message:new', {
        id: newMessage.id,
        room_id: roomId,
        sender_id: senderId,
        username: username,
        content: newMessage.content,
        created_at: newMessage.created_at.toISOString()
      });
    }

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

// Get messages
export async function getMessages(req: any, res: any) {
  const roomId = parseInt(req.params.roomId);
  const limit = 50; // Get last 50 messages

  // Get authenticated user from session
  const user = req.session?.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    // For game rooms (not lobby), verify user is a player in the game
    if (roomId !== LOBBY_ROOM_ID) {
      const playerCheck = await query(
        `SELECT user_id FROM room_players WHERE room_id = $1 AND user_id = $2`,
        [roomId, user.id]
      );

      if (playerCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a player in this game' });
        return;
      }
    }

    // Get messages from database
    // For lobby (room_id = 0), query for NULL room_id
    let result;
    if (roomId === LOBBY_ROOM_ID) {
      result = await query(
        `SELECT m.id, m.sender_id, u.username, m.content, m.created_at 
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.room_id IS NULL
         ORDER BY m.created_at DESC 
         LIMIT $1`,
        [limit]
      );
    } else {
      result = await query(
        `SELECT m.id, m.sender_id, u.username, m.content, m.created_at 
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.room_id = $1
         ORDER BY m.created_at DESC 
         LIMIT $2`,
        [roomId, limit]
      );
    }

    // Reverse so oldest is first
    const messages = result.rows.reverse();

    res.status(200).json({
      success: true,
      messages: messages
    });

  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
}
