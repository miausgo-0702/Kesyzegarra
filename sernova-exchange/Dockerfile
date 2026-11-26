# SERNOVA EXCHANGE — imagen para cualquier hosting con Docker
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    SERNOVA_PUBLIC=1 \
    SERNOVA_TRUST_PROXY=1 \
    SERNOVA_DATA_DIR=/data \
    PORT=8765
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
