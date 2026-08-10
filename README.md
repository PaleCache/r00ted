<p align="center">
  <img src="./public/icon-default.png" alt="R00TED Logo" width="220">
</p>

# R00TED

> Beyond identity. Beyond control. True freedom.

A self hosted, privacy first communication platform built for people who value digital sovereignty.

[![License](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/palecache/r00ted)](https://github.com/palecache/r00ted/stargazers)

---

## What is R00TED?

R00TED is a self hosted, privacy first communication platform that puts you in control of your own community.

No ads. No tracking. No centralized servers.

## Features

- Privacy first, self hosted communication platform.
- No sign up required.
- Real time messaging with whispers.
- Simple AES-256 encrypted messages (text only and opt in).
- XP and level progression.
- Custom badges and emotes.
- GIF search via Klipy (API key required).
- Voice chat and screen sharing via Jitsi Meet.
- Built in music player with support for local files and server hosted media.
- Shared playlists with synchronized playback via the built in music bot with music video support.
- YouTube and Kick live list with muti-view, chat, and live stream notifications (Kick API key required).
- Bot support.
- Discord style rich embeds for bots and youtube links.
- Image and video uploads.
- A casino style XP wagering system where users can risk and earn in app XP through games like Plinko, Blackjack, and Poker, with both single player and friend based multiplayer modes.

## Requirements

- Linux (recommended)
- Node.js
- Nginx (or another reverse proxy)
- A working Jitsi Meet installation (used for voice chat and screen sharing)
- A domain or sub domain is technically optional with some changes, but you'll need one to get HTTPS working properly. (You should use one, it's easy are free if you use something like duckdns etc)

## Installation

Clone the repository and install the dependencies.

```bash
git clone https://github.com/palecache/r00ted.git
cd r00ted
npm install
```

## Configuration

Before starting the server, configure the following files:

- `config/server-config.json`
- `app/configs/appconfig.json` (desktop app only)
- `chatPassword` is a single shared password. Anyone who knows it can join your server.

---

## Reverse Proxy (Nginx)

R00TED only listens on `127.0.0.1:5350`, so it is **not directly accessible** from the internet.

Place Nginx (or another reverse proxy) in front of it and configure HTTPS.

Before using this configuration, replace:

- `yourdomain.example.com`
- `/path/to/r00ted`

with your own values.

```nginx
server {
    charset utf-8;
    listen 443 ssl;
    server_name yourdomain.example.com;
    client_max_body_size 200M;

    ssl_certificate /etc/letsencrypt/live/yourdomain.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    root /path/to/r00ted/public;
    index index.html;

    location / {
        try_files $uri @proxy;
    }

    location /uploads/ {
        alias /path/to/r00ted/uploads/;
        expires 30d;
        access_log off;
        client_max_body_size 200M;
    }

    location /avatars/ {
        alias /path/to/r00ted/public/avatars/;
        expires 30d;
        access_log off;
    }

    location @proxy {
        proxy_pass http://127.0.0.1:5350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    location = /login {
        proxy_pass http://127.0.0.1:5350/login;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /upload-image {
        client_max_body_size 200M;
        proxy_pass http://127.0.0.1:5350/upload-image;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /upload-avatar {
        client_max_body_size 200M;
        proxy_pass http://127.0.0.1:5350/upload-avatar;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /upload-emote {
        client_max_body_size 10M;
        proxy_pass http://127.0.0.1:5350/upload-emote;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    location ~ ^/delete-emote/ {
        proxy_pass http://127.0.0.1:5350;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:5350/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }
}

server {
    listen 80;
    server_name yourdomain.example.com;
    return 301 https://$host$request_uri;
}
```

After saving the configuration, verify it:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## File Permissions

After installing, or whenever file permissions become incorrect, run the following from the project root.

```bash
find uploads -type d -exec chmod 750 {} \;
find uploads -type f -exec chmod 640 {} \;

find public/avatars -type d -exec chmod 755 {} \;
find public/avatars -type f -exec chmod 644 {} \;

find public -type d -exec chmod 755 {} \;
find public -type f -exec chmod 644 {} \;

chmod 700 config
chmod 600 config/*.json

chmod 700 data
chmod 600 data/*.json
```

### Why these permissions?

#### `uploads/`

Stores uploaded images and videos. Files never need to be executable, so directories use `750` and files use `640`.

#### `public/avatars/`

Stores uploaded avatars and custom emotes. Since these are publicly served images, standard `755/644` permissions are appropriate.

#### `public/`

Contains the frontend (HTML, CSS, JavaScript, icons, etc.). These are application files, not user uploads.

#### `config/`

Contains sensitive configuration, including your chat password, bot password and API keys. Restricted to the owner with `700/600`.

#### `data/`

Contains user accounts, messages, playlists, roles and channels. Restricted to the owner with `700/600` to protect user data.


## Running the Server

Start the server from the project directory.

```bash
node server.js
```

For production deployments, it's recommended to run R00TED using a process manager such as PM2 or a systemd service so it survives terminal sessions and reboots.

---

## Building the Desktop App

### Linux

```bash
npx electron-builder --linux --publish=never
```

### Windows

```bash
npx electron-builder --win --publish=never
```

Build on the target operating system. Use Linux to build Linux binaries and Windows to build Windows binaries. If needed, use a virtual machine.

---


### Notes

Run the permission commands as the user that owns the project, or with `sudo`.

If you receive an `Operation not permitted` error, check file ownership first.

```bash
ls -l uploads/<file>
```

If necessary, change ownership or rerun the commands with `sudo`.

If you change the user running the Node.js process, rerun the permission commands so the new user has write access.

## 💰 Support Development
`monero(xmr): 455KNy55xW9cK4sGknaHwEHD7s3RYcS1nb3bdACZVNpJDey47BegHWpjUghbPu64xxMi2fZwqG95wfextdwDcXbbALSDFVw`

---
