# BATTALION DH — Connected Full-Stack Starter

This project contains the BATTALION DH frontend and its Express backend in one project. The backend serves the frontend, so you do not need to open the HTML file separately.

## What is connected
- Real registration and login using JWT sessions
- Student/moderator roles
- Moderator-only One Shot YouTube uploads
- Moderator-only Notes PDF uploads
- Moderator-only Book PDF uploads
- Resource search
- Persistent bookmarks in SQLite
- Announcements
- Moderator resource deletion
- PDF storage in the `uploads/` directory

## Run locally
Requirements: Node.js 18+ (20+ recommended).

1. Open a terminal in this folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and change the secrets.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Moderator account
During signup, enter the value of `MODERATOR_INVITE_CODE` when prompted if you want the new account to be a moderator. Keep that code private and change it before deployment.

## Important production steps
- Set a long random `JWT_SECRET`.
- Set a private random `MODERATOR_INVITE_CODE`.
- Use HTTPS.
- Move SQLite/file storage to managed production services if the site grows.
- Add rate limiting, email verification/password reset, backups, and stronger upload validation before public launch.

## Project structure
- `server.js` — Express API + database setup
- `public/index.html` — connected BATTALION DH frontend
- `uploads/` — uploaded PDFs
- `battalion.db` — created automatically when the server starts
