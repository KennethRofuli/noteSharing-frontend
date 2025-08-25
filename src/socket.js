import { io } from 'socket.io-client';

//const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://notesharing-backend-unj3.onrender.com';


const socket = io(SOCKET_URL, 
    { 
        autoConnect: true, 
        transports: ['websocket', 'polling']
    });


//const socket = io(SOCKET_URL, { autoConnect: true });

export default socket;