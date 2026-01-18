const db = require('../config/database');

const chatController = {
    // --- User Methods ---

    // Check if user has an active or pending chat
    getUserSession: async (req, res) => {
        try {
            const userId = req.user.id;

            const session = await db.query(
                `SELECT * FROM chat_sessions 
         WHERE user_id = $1 AND status IN ('pending', 'active') 
         ORDER BY created_at DESC LIMIT 1`,
                [userId]
            );

            if (session.rows.length === 0) {
                return res.json({ success: true, session: null });
            }

            res.json({ success: true, session: session.rows[0] });
        } catch (error) {
            console.error('Error fetching user session:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    },

    // Create a new chat session request
    requestChat: async (req, res) => {
        try {
            const userId = req.user.id;

            // Check if already has a session
            const existing = await db.query(
                `SELECT * FROM chat_sessions 
         WHERE user_id = $1 AND status IN ('pending', 'active')`,
                [userId]
            );

            if (existing.rows.length > 0) {
                return res.status(400).json({ success: false, error: 'Active session already exists' });
            }

            const newSession = await db.query(
                `INSERT INTO chat_sessions (user_id, status) 
         VALUES ($1, 'pending') 
         RETURNING *`,
                [userId]
            );

            // Notify admins via socket if possible (handled in socketHandler usually)
            if (global.io) {
                global.io.to('admins').emit('admin_new_chat_request', newSession.rows[0]);
            }

            res.json({ success: true, session: newSession.rows[0] });
        } catch (error) {
            console.error('Error requesting chat:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    },

    // Get messages for a session
    getMessages: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const userRole = req.user.role;

            // Verify access
            const session = await db.query('SELECT * FROM chat_sessions WHERE id = $1', [sessionId]);
            if (session.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Session not found' });
            }

            if (userRole !== 'admin' && session.rows[0].user_id !== userId) {
                return res.status(403).json({ success: false, error: 'Unauthorized' });
            }

            const messages = await db.query(
                `SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
                [sessionId]
            );

            res.json({ success: true, messages: messages.rows });
        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    },

    // Send a message (HTTP fallback or initial message)
    sendMessage: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { content } = req.body;
            const userId = req.user.id;
            const userRole = req.user.role;

            // Determine sender type
            const senderType = userRole === 'admin' ? 'admin' : 'user';

            const newMessage = await db.query(
                `INSERT INTO messages (session_id, sender_type, sender_id, content) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
                [sessionId, senderType, userId, content]
            );

            // Emit socket event
            if (global.io) {
                global.io.to(`chat_${sessionId}`).emit('new_message', newMessage.rows[0]);

                // Also emit to specific user/admin rooms for robust delivery
                // We need to know the session owner to target them
                const sessionResult = await db.query('SELECT user_id FROM chat_sessions WHERE id = $1', [sessionId]);
                if (sessionResult.rows.length > 0) {
                    const sessionOwnerId = sessionResult.rows[0].user_id;

                    // If admin sent it, notify the user specifically
                    if (senderType === 'admin') {
                        global.io.to(`user_${sessionOwnerId}`).emit('new_message', newMessage.rows[0]);
                    }
                    // If user sent it, notify admins (optional, but good for dashboard alerts if we had them)
                    else {
                        // global.io.to('admins').emit('new_message_alert', newMessage.rows[0]); 
                    }
                }
            }

            res.json({ success: true, message: newMessage.rows[0] });
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    },

    // --- Admin Methods ---

    // Get all chats (filtered by status)
    getAdminChats: async (req, res) => {
        try {
            const { status } = req.query; // 'pending', 'active', 'closed', or 'all'

            let query = `
        SELECT cs.*, u.name as user_name, u.email as user_email 
        FROM chat_sessions cs
        JOIN users u ON cs.user_id = u.id
      `;
            const params = [];

            if (status && status !== 'all') {
                query += ` WHERE cs.status = $1`;
                params.push(status);
            }

            query += ` ORDER BY cs.created_at DESC`; // Newest first

            const sessions = await db.query(query, params);

            res.json({ success: true, sessions: sessions.rows });
        } catch (error) {
            console.error('Error fetching admin chats:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    },

    // Accept a chat request
    acceptChat: async (req, res) => {
        try {
            const { sessionId } = req.params;

            const updatedSession = await db.query(
                `UPDATE chat_sessions 
         SET status = 'active', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING *`,
                [sessionId]
            );

            if (updatedSession.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Session not found' });
            }

            // Notify user via socket
            if (global.io) {
                global.io.to(`chat_${sessionId}`).emit('chat_status_changed', { status: 'active' });
                // Notify specific user (for Profile updates)
                global.io.to(`user_${updatedSession.rows[0].user_id}`).emit('chat_session_updated', updatedSession.rows[0]);
                // Also notify admin dashboard updates
                global.io.to('admins').emit('admin_chat_updated', updatedSession.rows[0]);
            }

            res.json({ success: true, session: updatedSession.rows[0] });
        } catch (error) {
            console.error('Error accepting chat:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    },

    // Close a chat session
    closeChat: async (req, res) => {
        try {
            const { sessionId } = req.params;

            const updatedSession = await db.query(
                `UPDATE chat_sessions 
         SET status = 'closed', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING *`,
                [sessionId]
            );

            if (global.io) {
                global.io.to(`chat_${sessionId}`).emit('chat_status_changed', { status: 'closed' });
                global.io.to(`user_${updatedSession.rows[0].user_id}`).emit('chat_session_updated', updatedSession.rows[0]);
                global.io.to('admins').emit('admin_chat_updated', updatedSession.rows[0]);
            }

            res.json({ success: true, session: updatedSession.rows[0] });
        } catch (error) {
            console.error('Error closing chat:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    }
};

module.exports = chatController;
