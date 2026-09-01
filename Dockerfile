# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run stage ----
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 5173
COPY --from=build /app/dist ./dist
COPY server.mjs ./
USER node
CMD ["node", "server.mjs"]