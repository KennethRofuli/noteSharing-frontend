import React, { useState, useEffect, useRef } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import '../pages/styles/Notifications.css';

function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  
  const fetchNotifications = async () => {
    try {
      const response = await API.get('/notifications', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };
  
  const fetchUnreadCount = async () => {
    try {
      const response = await API.get('/notifications/unread-count', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setUnreadCount(response.data.count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };
  
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    
    const socket = window.socket;
    console.log("Setting up notification listeners, socket connected:", socket?.connected);
    
    // Only set up listeners if socket exists and is connected
    if (socket) {
      // Re-register listeners whenever this effect runs
      socket.off('new_notification');
      socket.off('note-shared');
      
      socket.on('new_notification', (data) => {
        console.log('Received new notification:', data);
        setNotifications(prev => [data, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
      
      socket.on('note-shared', (data) => {
        console.log('Note shared, updating notification count');
        setUnreadCount(prev => prev + 1);
        fetchNotifications();
      });
      
      // Also listen for socket reconnection events
      socket.on('connect', () => {
        console.log('Socket reconnected - refetching notifications');
        fetchNotifications();
        fetchUnreadCount();
      });
    }
    
    return () => {
      if (socket) {
        socket.off('new_notification');
        socket.off('note-shared');
        socket.off('connect');
      }
    };
  }, [window.socket]); // Add socket as dependency
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };
  
  const markAsRead = async (id) => {
    try {
      await API.put(`/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setNotifications(notifications.map(notif => 
        notif._id === id ? { ...notif, read: true } : notif
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };
  
  const markAllAsRead = async () => {
    try {
      await API.put('/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setNotifications(notifications.map(notif => ({ ...notif, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };
  
  const handleNotificationClick = (notification) => {
    markAsRead(notification._id);
    
    if (notification.type === 'note_shared') {
      navigate('/dashboard');
    } else if (notification.type === 'new_message') {
      if (window.openChat && notification.sender) {
        window.openChat(notification.sender._id);
      }
    }
    
    setIsOpen(false);
  };
  
  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <div className="notification-bell" onClick={toggleDropdown}>
        <i className="fas fa-bell"></i>
        {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
      </div>
      
      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="mark-read-btn" onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>
          
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">No notifications</div>
            ) : (
              notifications.map(notification => (
                <div 
                  key={notification._id}
                  className={`notification-item ${notification.read ? '' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-content">
                    <strong>{notification.sender?.name || 'Someone'}</strong> 
                    {notification.type === 'note_shared' ? ' shared a note with you' : ' sent you a message'}
                  </div>
                  <div className="notification-preview">
                    {notification.content}
                  </div>
                  <div className="notification-time">
                    {new Date(notification.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;