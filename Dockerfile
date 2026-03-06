FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY . .
RUN npm run build

EXPOSE 8787
CMD ["node", "dist-server/index.js"]
