// src/frontend/chat.ts
// SIMPLE CHAT - Just makes messages work!

// @ts-ignore - ignore TypeScript errors for io
const socket = io();

const LOBBY_ROOM_ID = 1; // The lobby room we created

// When connected, join the lobby room
socket.on('connect', () => {
  console.log('Chat connected!');
  socket.emit('room:join', { roomId: LOBBY_ROOM_ID, userId: 1 });
});

// When a new message arrives, show it
socket.on('room:message:new', (messageData: any) => {
  if (messageData.room_id === LOBBY_ROOM_ID) {
    showMessage(messageData);
  }
});

// When page loads, set up the form
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form[action="/chat/send"]') as HTMLFormElement;
  const input = form?.querySelector('input[name="message"]') as HTMLInputElement;
  
  if (form && input) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); // Don't submit normally
      
      const message = input.value.trim();
      if (!message) return;
      
      // Disable while sending
      input.disabled = true;
      
      try {
        // Send to server
        const response = await fetch(`/api/rooms/${LOBBY_ROOM_ID}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message })
        });
        
        if (response.ok) {
          input.value = ''; // Clear input
        } else {
          alert('Failed to send message');
        }
      } catch (error) {
        alert('Error sending message');
      } finally {
        input.disabled = false;
        input.focus();
      }
    });
  }
  
  // Load old messages
  loadOldMessages();
});

// Show a message on screen
function showMessage(msg: any) {
  const container = document.querySelector('.overflow-y-auto.space-y-3');
  if (!container) return;
  
  // Remove "no messages" text if it exists
  const placeholder = container.querySelector('.text-gray-400.text-center');
  if (placeholder) placeholder.remove();
  
  // Create message HTML
  const messageDiv = document.createElement('div');
  messageDiv.className = 'bg-white rounded-lg p-3 shadow-sm';
  
  const time = new Date(msg.created_at).toLocaleTimeString();
  
  messageDiv.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="font-semibold text-blue-600 text-sm">${msg.username}</span>
      <span class="text-xs text-gray-400">${time}</span>
    </div>
    <p class="text-gray-700 text-sm">${msg.content}</p>
  `;
  
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight; // Scroll to bottom
}

// Load messages that already exist
async function loadOldMessages() {
  try {
    const response = await fetch(`/api/rooms/${LOBBY_ROOM_ID}/messages`);
    const data = await response.json();
    
    if (data.success && data.messages) {
      // Clear container
      const container = document.querySelector('.overflow-y-auto.space-y-3');
      if (container) container.innerHTML = '';
      
      // Show each message
      data.messages.forEach((msg: any) => showMessage(msg));
    }
  } catch (error) {
    console.error('Failed to load messages:', error);
  }
}