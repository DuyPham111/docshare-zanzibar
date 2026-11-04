# Image chạy DocShare API (src/server.js). Không chứa server demo, test hay devDependencies.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Cài dependency trước để Docker cache lớp này khi chỉ đổi mã nguồn.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY authz ./authz
COPY data ./data
COPY src ./src

# Không chạy bằng root.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
