import { query } from '../database';

// Send a message
export async function sendMessage(req: any, res: any) {
  const roomId = req.params.roomId;
  const content = req.body.content;
  
  // For now, hardcode user info (you'll add auth later)
  const senderId = 1;
  const username = 'Player1';

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

    // Save message to database
    const result = await query(
      `INSERT INTO messages (room_id, sender_id, message_type, content, created_at) 
       VALUES ($1, $2, 'chat', $3, NOW())
       RETURNING id, room_id, sender_id, message_type, content, created_at`,
      [roomId, senderId, content.trim()]
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
      io.to(`room:${roomId}`).emit('room:message:new', {
        id: newMessage.id,
        room_id: parseInt(roomId),
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
  const roomId = req.params.roomId;
  const limit = 50; // Get last 50 messages

  try {
    // Get messages from database
    const result = await query(
      `SELECT m.id, m.sender_id, u.username, m.content, m.created_at 
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.room_id = $1 
       ORDER BY m.created_at DESC 
       LIMIT $2`,
      [roomId, limit]
    );

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