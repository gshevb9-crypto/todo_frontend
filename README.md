# ToDo List Vercel — Notion-Inspired Frontend

Independent React 18 + TypeScript SPA deployed to Vercel, connecting to the ASP.NET Core backend.

## Features

- **Tabs Management**: Create, list, reorder, rename, and delete personal notebook tabs.
- **Notes & Content**: Markdown-ready text editor with auto-saving, keyboard shortcuts (`Ctrl+S`), and formatting toolbar.
- **Image Management**: Size-aware WebP image upload, preview thumbnails, one-click markdown insertion, replacement, and physical file deletion.
- **Authentication**: Passwordless Email OTP delivery and Google OAuth 2.0 with automatic token refresh on 401 via Axios interceptors.
- **Vercel Deployment**: Configured with `vercel.json` SPA routing rewrites and zero-config deployment.

## Deployment to Vercel

1. Push this directory to your GitHub repository (or deploy via Vercel CLI: `vercel`).
2. In the Vercel project dashboard, navigate to **Settings** -> **Environment Variables**.
3. Add:
   - `VITE_API_BASE_URL`: The public HTTPS URL of your deployed backend (e.g. `https://api.yourdomain.com`).
4. Trigger a deployment.
