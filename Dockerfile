# Optional multiplayer server (the game itself is a static site).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
ENV PORT=8787 DATA_FILE=/data/accounts.json
VOLUME /data
EXPOSE 8787
CMD ["npx", "tsx", "src/net/server/index.ts"]
