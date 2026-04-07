FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p /app/content /app/data /app/uploads && \
    addgroup -S blog && adduser -S blog -G blog && \
    chown -R blog:blog /app
USER blog
EXPOSE 1911
ENV PORT=1911
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:1911/health || exit 1
CMD ["node", "server.js"]
