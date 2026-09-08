# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=384"
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run stage ----
FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 5173
COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY server ./server
USER node
CMD ["node", "server.mjs"]
