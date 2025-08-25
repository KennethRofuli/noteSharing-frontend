import axios from 'axios';

const API = axios.create({
    baseURL: 'https://notesharing-backend-unj3.onrender.com/api'
    //baseURL: 'http://localhost:3000/api'
});

// Add JWT token to request headers if available
API.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default API;
