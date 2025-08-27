import { useEffect, useRef, useState, useCallback } from 'react';
import API from '../api/api';
import socket from '../socket';
import messageIcon from '../assets/envelope.jpg';
import '../pages/styles/ChatWidget.css'; // Updated import path

export default function ChatWidget({ currentUserId }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [chatUsers, setChatUsers] = useState([]);
  const [chatRecipient, setChatRecipient] = useState(null);
  const [viewMode, setViewMode] = useState('conversations'); // 'conversations' or 'chat'
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const PAGE_SIZE = 20;
  const [chatPage, setChatPage] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const chatScrollRef = useRef(null);

  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    if (!currentUserId) return;
    const register = () => {
      if (socket && socket.connected) {
        socket.emit('register', String(currentUserId));
      }
    };
    register();
    socket.on('connect', register);
    socket.on('reconnect', register);
    return () => {
      socket.off('connect', register);
      socket.off('reconnect', register);
    };
  }, [currentUserId]);

  // Load conversations when chat is opened
  useEffect(() => {
    if (!chatOpen || viewMode !== 'conversations') return;
    
    const fetchConversations = async () => {
      setLoadingConversations(true);
      try {
        const res = await API.get('/chat/conversations', {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setConversations(res.data || []);
      } catch (err) {
        console.error('Error fetching conversations', err);
        setConversations([]);
      } finally {
        setLoadingConversations(false);
      }
    };
    
    fetchConversations();
  }, [chatOpen, viewMode]);

  // fetch users for chat search / verified
  useEffect(() => {
    if (!chatOpen || viewMode !== 'search') return;
    const fetchUsers = async () => {
      try {
        const q = chatSearch.trim();
        const url = q.length > 0 ? `/users/search?q=${encodeURIComponent(q)}` : '/users/verified';
        const res = await API.get(url, { headers: { Authorization: `Bearer ${getToken()}` } });
        setChatUsers(res.data || []);
      } catch {
        setChatUsers([]);
      }
    };
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
  }, [chatSearch, chatOpen, viewMode]);

  useEffect(() => {
    socket.on('chat-message', (msg) => {
      setChatMessages(prev => {
        if (!chatRecipient) return prev;
        const belongs = (msg.from === currentUserId && msg.to === chatRecipient._id) ||
                        (msg.from === chatRecipient._id && msg.to === currentUserId);
        if (!belongs) return prev;
        return [...prev, msg];
      });
      
      // Also update conversations list if a new message arrives
      if (chatOpen) {
        fetchConversations();
      }
    });
    return () => socket.off('chat-message');
  }, [chatRecipient, currentUserId, chatOpen]);

  const fetchConversations = async () => {
    try {
      const res = await API.get('/chat/conversations', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setConversations(res.data || []);
    } catch (err) {
      console.error('Error fetching conversations', err);
    }
  };

  const scrollChatToBottom = (behavior = 'auto') => {
    const el = chatScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 100;
    if (nearBottom) scrollChatToBottom('smooth');
  }, [chatMessages]);

  const fetchHistoryPage = async (recipientId, page = 0) => {
    if (!recipientId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const skip = page * PAGE_SIZE;
      const res = await API.get(`/chat/history/${recipientId}?limit=${PAGE_SIZE}&skip=${skip}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      let msgs = Array.isArray(res.data) ? res.data : [];
      if (msgs.length > 1) {
        const firstTs = new Date(msgs[0].timestamp || msgs[0].createdAt || msgs[0].time || 0).getTime();
        const lastTs = new Date(msgs[msgs.length - 1].timestamp || msgs[msgs.length - 1].createdAt || msgs[msgs.length - 1].time || 0).getTime();
        if (firstTs > lastTs) msgs = msgs.reverse();
      }

      if (page === 0) {
        setChatMessages(msgs);
        setChatPage(0);
        setChatHasMore(msgs.length === PAGE_SIZE);
        setTimeout(() => scrollChatToBottom('auto'), 50);
      } else {
        const el = chatScrollRef.current;
        const prevScrollHeight = el ? el.scrollHeight : 0;
        setChatMessages(prev => {
          const existingIds = new Set(prev.map(m => m._id || `${m.from}_${m.to}_${m.timestamp}`));
          const uniqueOlder = msgs.filter(m => !existingIds.has(m._id || `${m.from}_${m.to}_${m.timestamp}`));
          return [...uniqueOlder, ...prev];
        });
        setChatPage(page);
        setChatHasMore(msgs.length === PAGE_SIZE);
        setTimeout(() => {
          if (!el) return;
          const newScrollHeight = el.scrollHeight;
          el.scrollTop = newScrollHeight - prevScrollHeight + (el.scrollTop || 0);
        }, 50);
      }
    } catch (err) {
      console.error('fetchHistoryPage', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    setChatMessages([]);
    setChatPage(0);
    setChatHasMore(true);
    setLoadingOlder(false);
    if (chatRecipient) {
      fetchHistoryPage(chatRecipient._id, 0);
      setViewMode('chat');
    }
  }, [chatRecipient]);

  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el || !chatRecipient || loadingOlder || !chatHasMore) return;
    if (el.scrollTop <= 60) fetchHistoryPage(chatRecipient._id, chatPage + 1);
  };

  const sendChat = useCallback(() => {
    if (!chatInput.trim() || !chatRecipient) return;
    
    const msg = { 
      to: String(chatRecipient._id),
      text: chatInput, 
      from: String(currentUserId),
      timestamp: new Date().toISOString() 
    };
    
    // Remove this line - don't add message optimistically
    // setChatMessages(prev => [...prev, { ...msg, self: true }]);
    
    setChatInput(''); // Clear input immediately for better UX
    
    // Emit the message - let the server handle adding it to the UI
    socket.emit('chat-message', msg, (acknowledgment) => {
      if (acknowledgment && acknowledgment.error) {
        console.error('Failed to send message:', acknowledgment.error);
        // Optionally show error message to user
      }
    });
    
    // After sending a message, update the conversations list
    setTimeout(() => {
      fetchConversations();
    }, 500);
  }, [chatInput, chatRecipient, currentUserId]);
  
  const startNewChat = () => {
    setChatRecipient(null);
    setChatSearch('');
    setChatUsers([]);
    setViewMode('search');
  };
  
  const selectConversation = (conversation) => {
    setChatRecipient({
      _id: conversation.userId,
      name: conversation.name,
      email: conversation.email
    });
    setViewMode('chat');
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    // If today, show only time
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // If within last 7 days, show day name
    const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    // Otherwise show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Add this inside your ChatWidget component
  useEffect(() => {
    if (chatOpen && viewMode === 'conversations') {
      console.log('Attempting to fetch conversations');
      API.get('/chat/conversations', {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      .then(res => {
        console.log('Conversations API response:', res.data);
        setConversations(res.data || []);
      })
      .catch(err => {
        console.error('Error fetching conversations:', err);
      })
      .finally(() => {
        setLoadingConversations(false);
      });
    }
  }, [chatOpen, viewMode]);

  return (
    <div className={`chat-widget${chatOpen ? ' open' : ' closed'}`}>
      {!chatOpen ? (
        <button
          className="chat-fab"
          onClick={() => setChatOpen(true)}
          aria-label="New message"
          title="New message"
        >
          <img src={messageIcon} alt="New message" />
        </button>
      ) : (
        <div className="chat-window">
          <div className="chat-header">
            {viewMode === 'chat' && chatRecipient ? (
              <>
                <button className="chat-back-btn" onClick={() => setViewMode('conversations')}>←</button>
                <span>{chatRecipient.name || chatRecipient.email}</span>
              </>
            ) : (
              <span>Messages</span>
            )}
            <button
              className="chat-close-btn"
              onClick={() => {
                setChatOpen(false);
                setChatRecipient(null);
                setChatMessages([]);
                setChatSearch('');
                setChatUsers([]);
                setViewMode('conversations');
              }}
            >×</button>
          </div>

          {viewMode === 'search' && (
            <div className="chat-search-container">
              <div className="chat-search-header">
                <button className="chat-back-btn" onClick={() => setViewMode('conversations')}>←</button>
                <input
                  className="chat-search-input"
                  placeholder="Search user by email..."
                  value={chatSearch}
                  onChange={e => { setChatSearch(e.target.value); setChatRecipient(null); }}
                  autoFocus
                />
              </div>
              <ul className="chat-user-list">
                {chatUsers.map(u => (
                  <li
                    key={u._id}
                    className={chatRecipient && chatRecipient._id === u._id ? 'selected' : ''}
                    onClick={() => { setChatRecipient(u); setChatSearch(u.email); setChatUsers([]); }}
                  >
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viewMode === 'conversations' && (
            <div className="chat-conversations-container">
              <div className="chat-new-message-btn-container">
                <button className="chat-new-message-btn" onClick={startNewChat}>
                  New Message
                </button>
              </div>
              {loadingConversations ? (
                <div className="chat-loading">Loading conversations...</div>
              ) : conversations.length > 0 ? (
                <ul className="chat-conversation-list">
                  {conversations.map((conv) => (
                    <li 
                      key={conv.userId} 
                      className="chat-conversation-item"
                      onClick={() => selectConversation(conv)}
                    >
                      <div className="chat-conversation-details">
                        <div className="chat-conversation-name">
                          {conv.name || conv.email}
                          <span className="chat-conversation-time">
                            {formatTimestamp(conv.lastMessageTime)}
                          </span>
                        </div>
                        <div className="chat-conversation-preview">
                          {conv.lastMessage}
                          {conv.unreadCount > 0 && (
                            <span className="chat-unread-badge">{conv.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="chat-empty-state">
                  No conversations yet. Start a new message to chat with someone.
                </div>
              )}
            </div>
          )}

          {viewMode === 'chat' && (
            <>
              <div className="chat-messages" ref={chatScrollRef} onScroll={handleChatScroll} style={{ overflowY: 'auto' }}>
                {chatRecipient ? (
                  chatMessages.length > 0 ? (
                    chatMessages
                      .filter(m =>
                        (m.from === currentUserId && m.to === chatRecipient._id) ||
                        (m.from === chatRecipient._id && m.to === currentUserId) ||
                        (m.to === currentUserId && m.from === chatRecipient._id) ||
                        (m.to === chatRecipient._id && m.from === currentUserId)
                      )
                      .map((m, i) => (
                        <div key={m._id || `${i}-${m.timestamp}`} className={`chat-message-row${(m.from === currentUserId || m.self) ? ' self' : ''}`}>
                          <span className="chat-message-bubble">{m.text}</span>
                        </div>
                      ))
                  ) : (
                    <div style={{ color: '#888', fontSize: 14, padding: 12 }}>No messages yet — say hello</div>
                  )
                ) : (
                  <div style={{ color: '#888', fontSize: 14 }}>Select a user to chat</div>
                )}
                {loadingOlder && <div style={{ textAlign: 'center', padding: 8, color: '#666' }}>Loading...</div>}
              </div>

              <div className="chat-input-row">
                <input
                  className="chat-input"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                  disabled={!chatRecipient}
                />
                <button className="chat-send-btn" onClick={sendChat} disabled={!chatInput.trim() || !chatRecipient}>Send</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}