FROM node:20-alpine AS base
WORKDIR /app

# Copier package.json ET package-lock.json pour un build reproductible via `npm ci`
# (verrouille les versions exactes du lock file, contrairement à `npm install`).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3007

CMD ["node", "src/index.js"]
