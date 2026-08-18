# dsh-games standalone game server — the multiplayer/room + custom-pet server
# the plugin's browser half talks to. Deliberately NOT a DSH host: this image
# ships only the zero-dependency game server bundle (lib/server.js).
#
#   docker build -t dsh-games-server .
#   docker compose up -d --build
#
# Config via env:
#   GAME_HOST  bind host          (default 0.0.0.0)
#   GAME_PORT  listen port        (default 3080)
#   GAME_DATA  data dir (pets)    (default /data, volume-mounted)
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    GAME_HOST=0.0.0.0 \
    GAME_PORT=3080 \
    GAME_DATA=/data

WORKDIR /opt/dsh-games-server

# Only the server bundle is needed — it has zero runtime dependencies
# (node builtins only), so no npm install happens in this image.
COPY lib/server.js ./lib/server.js
COPY package.json ./package.json

# Note: the username is not `games` — Debian ships a `games` group that would
# collide with useradd's default user-group creation.
RUN useradd --system --uid 1001 --home-dir /opt/dsh-games-server dshgames \
    && mkdir -p /data \
    && chown -R dshgames:dshgames /opt/dsh-games-server /data

USER dshgames

EXPOSE 3080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3080/api/games/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "lib/server.js"]
