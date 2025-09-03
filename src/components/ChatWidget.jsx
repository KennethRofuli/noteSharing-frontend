import { useEffect, useRef, useState, useCallback } from 'react';
import API from '../api/api';
import socket from '../socket';
import '../pages/styles/ChatWidget.css';

export default function ChatWidget({ currentUserId }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [chatUsers, setChatUsers] = useState([]);
  const [chatRecipient, setChatRecipient] = useState(null);
  const [viewMode, setViewMode] = useState('conversations');
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const PAGE_SIZE = 20;
  const [chatPage, setChatPage] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const chatScrollRef = useRef(null);

  const getToken = () => localStorage.getItem('token');

  // Fetch conversations function
  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    
    setLoadingConversations(true);
    try {
      const res = await API.get('/chat/conversations', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      console.log('Conversations fetched:', res.data);
      setConversations(res.data || []);
      
      // Calculate total unread count
      const totalUnread = (res.data || []).reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      setUnreadCount(totalUnread);
      setHasNewMessage(totalUnread > 0);
      
      // Store unread count in localStorage
      localStorage.setItem(`unreadCount_${currentUserId}`, totalUnread.toString());
    } catch (err) {
      console.error('Error fetching conversations', err);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, [currentUserId]);

  // Load unread count from localStorage on component mount
  useEffect(() => {
    if (currentUserId) {
      // Load stored unread count first
      const storedUnreadCount = localStorage.getItem(`unreadCount_${currentUserId}`);
      if (storedUnreadCount) {
        const count = parseInt(storedUnreadCount, 10);
        setUnreadCount(count);
        setHasNewMessage(count > 0);
      }
      
      // Then fetch fresh data
      fetchConversations();
    }
  }, [currentUserId, fetchConversations]);

  // Update localStorage when unread count changes
  useEffect(() => {
    if (currentUserId && unreadCount >= 0) {
      localStorage.setItem(`unreadCount_${currentUserId}`, unreadCount.toString());
    }
  }, [unreadCount, currentUserId]);

  // Update conversation locally without fetching from server
  const updateConversationLocally = useCallback((message) => {
    setConversations(prev => {
      const updated = [...prev];
      const otherUserId = message.from === currentUserId ? message.to : message.from;
      
      // Find existing conversation
      const existingIndex = updated.findIndex(conv => conv.userId === otherUserId);
      
      if (existingIndex >= 0) {
        // Update existing conversation
        updated[existingIndex] = {
          ...updated[existingIndex],
          lastMessage: message.text,
          lastMessageTime: message.timestamp,
          // Only increase unread count if it's not our message and chat is closed or not in this conversation
          unreadCount: message.from !== currentUserId && (!chatOpen || (chatRecipient && chatRecipient._id !== message.from))
            ? (updated[existingIndex].unreadCount || 0) + 1
            : updated[existingIndex].unreadCount || 0
        };
        
        // Move to top
        const conversation = updated.splice(existingIndex, 1)[0];
        updated.unshift(conversation);
      } else if (message.from !== currentUserId) {
        // Add new conversation for incoming message
        // We'll need to fetch user details for this, but for now just add basic info
        updated.unshift({
          userId: message.from,
          name: '', // Will be empty until we fetch user details
          email: '',
          lastMessage: message.text,
          lastMessageTime: message.timestamp,
          unreadCount: !chatOpen || (chatRecipient && chatRecipient._id !== message.from) ? 1 : 0
        });
      }
      
      return updated;
    });
  }, [currentUserId, chatOpen, chatRecipient]);

  // Fetch conversations on component mount
  useEffect(() => {
    if (currentUserId) {
      fetchConversations();
    }
  }, [currentUserId, fetchConversations]);

  // Register user with socket
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

  // Refresh conversations when chat is opened
  useEffect(() => {
    if (chatOpen && viewMode === 'conversations') {
      fetchConversations();
    }
  }, [chatOpen, viewMode, fetchConversations]);

  // fetch users for chat search
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

  // Listen for incoming chat messages
  useEffect(() => {
    const handleChatMessage = (msg) => {
      console.log('Received chat message:', msg);
      
      if (msg.from === currentUserId) {
        return;
      }
      
      setChatMessages(prev => {
        if (!chatRecipient) return prev;
        const belongs = (msg.from === currentUserId && msg.to === chatRecipient._id) ||
                        (msg.from === chatRecipient._id && msg.to === currentUserId);
        if (!belongs) return prev;
        return [...prev, msg];
      });
      
      updateConversationLocally(msg);
      
      if (!chatOpen || (chatRecipient && chatRecipient._id !== msg.from)) {
        setUnreadCount(prev => {
          const newCount = prev + 1;
          // Store updated count in localStorage
          localStorage.setItem(`unreadCount_${currentUserId}`, newCount.toString());
          return newCount;
        });
        setHasNewMessage(true);
      }
    };

    const handleNewMessage = (data) => {
      console.log('Received new message notification:', data);
      
      if (data.from === currentUserId) {
        return;
      }
      
      updateConversationLocally(data);
      
      if (!chatOpen) {
        setUnreadCount(prev => {
          const newCount = prev + 1;
          // Store updated count in localStorage
          localStorage.setItem(`unreadCount_${currentUserId}`, newCount.toString());
          return newCount;
        });
        setHasNewMessage(true);
      }
    };

    socket.on('chat-message', handleChatMessage);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('chat-message', handleChatMessage);
      socket.off('new_message', handleNewMessage);
    };
  }, [chatRecipient, currentUserId, chatOpen, updateConversationLocally]);

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
      to: chatRecipient._id, 
      text: chatInput, 
      from: currentUserId, 
      timestamp: new Date().toISOString() 
    };
    
    // Emit the message
    socket.emit('chat-message', msg);
    
    // Add to local messages immediately
    setChatMessages(prev => [...prev, { ...msg, self: true }]);
    
    // Update conversations locally (without fetching from server)
    updateConversationLocally(msg);
    
    setChatInput('');
  }, [chatInput, chatRecipient, currentUserId, updateConversationLocally]);
  
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
    
    const conversationUnreadCount = conversation.unreadCount || 0;
    if (conversationUnreadCount > 0) {
      setUnreadCount(prev => {
        const newCount = Math.max(0, prev - conversationUnreadCount);
        // Store updated count in localStorage
        localStorage.setItem(`unreadCount_${currentUserId}`, newCount.toString());
        return newCount;
      });
      setHasNewMessage(prev => {
        const newCount = Math.max(0, unreadCount - conversationUnreadCount);
        return newCount > 0;
      });
      
      setConversations(prev => prev.map(conv => 
        conv.userId === conversation.userId 
          ? { ...conv, unreadCount: 0 }
          : conv
      ));
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleToggle = () => {
    setChatOpen(!chatOpen);
    if (!chatOpen) {
      // Store that we've opened chat (reduces unread count)
      localStorage.setItem(`unreadCount_${currentUserId}`, '0');
      setUnreadCount(0);
      setHasNewMessage(false);
      fetchConversations();
    }
  };

  // Clear localStorage on logout
  useEffect(() => {
    const handleLogout = () => {
      if (currentUserId) {
        localStorage.removeItem(`unreadCount_${currentUserId}`);
      }
    };
    
    // You might want to call this when user actually logs out
    // For now, we'll clean up on component unmount if no currentUserId
    if (!currentUserId) {
      // Clear all unread counts (optional)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('unreadCount_')) {
          localStorage.removeItem(key);
        }
      });
    }
    
    return handleLogout;
  }, [currentUserId]);

  // Expose function globally for opening chat from notifications
  useEffect(() => {
    window.openChat = (userId) => {
      const user = conversations.find(conv => conv.userId === userId);
      if (user) {
        selectConversation(user);
        setChatOpen(true);
      } else {
        API.get(`/users/${userId}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        }).then(res => {
          setChatRecipient(res.data);
          setViewMode('chat');
          setChatOpen(true);
        }).catch(err => {
          console.error('Error fetching user for chat:', err);
        });
      }
    };

    return () => {
      delete window.openChat;
    };
  }, [conversations]);

  return (
    <div className={`chat-widget${chatOpen ? ' open' : ' closed'}`}>
      {!chatOpen ? (
        <button
          className={`chat-fab ${hasNewMessage ? 'has-notification' : ''}`}
          onClick={handleToggle}
          aria-label="New message"
          title="New message"
        >
          <i className="fas fa-comments"></i>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
          {hasNewMessage && (
            <i className="fas fa-exclamation notification-indicator"></i>
          )}
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