// Centralized API configuration for OptiML frontend
// Maps process.env.NEXT_PUBLIC_API_URL configured at build-time (Vercel)
// Fallback is http://127.0.0.1:8000 for local development

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
