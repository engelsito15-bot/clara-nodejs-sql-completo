FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN npm install --prefix frontend
COPY frontend ./frontend
RUN npm run build --prefix frontend

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/backend/data/clara.sqlite

COPY backend/package*.json ./backend/
RUN npm install --omit=dev --prefix backend
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]
EXPOSE 4000
CMD ["npm", "run", "start", "--prefix", "backend"]
