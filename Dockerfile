# syntax=docker/dockerfile:1
# Production image: Express API + Vite static assets (single origin).
# Gemini / Maps / Browser Use keys are optional — app runs with mock planners when unset.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --omit=dev
COPY backend/src ./backend/src
COPY --from=build /app/frontend/dist ./frontend/dist
WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "src/index.js"]
