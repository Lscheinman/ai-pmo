// src/api/apiConfig.js
const DEFAULT_BASE = 'http://localhost:8000/api'; // same-origin, works on CF when you map /api to the backend
export const API_BASE = (import.meta.env.VITE_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
console.log('API_BASE is', API_BASE);
