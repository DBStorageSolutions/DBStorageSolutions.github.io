# PDF Uploader Server

Quick server to accept PDF uploads, produce a viewer link that expires, and delete files after expiration.

Environment:
- `PORT` (optional) - port to run on, default 3000
- `BASE_URL` (optional) - public base URL used when returning `viewer` links (e.g. https://uploads.example.com). If empty, returned links are relative.

Install & run:

```bash
cd server
npm install
BASE_URL="https://your.domain" npm start
```

Notes:
- The viewer page disables context menu and some keyboard shortcuts, but cannot fully prevent downloads or screenshots. These protections are best-effort client-side only.
- Deploy this on a server you control (Heroku, VPS, Docker, etc.). Ensure `BASE_URL` matches the public host.
