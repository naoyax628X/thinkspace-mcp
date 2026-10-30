# Container image for Glama's automated checks (start + introspection).
# The local server itself targets macOS (it hands notes to the ThinkSpace app via the
# thinkspace:// URL scheme), so tool calls will not deliver anywhere inside a container.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
CMD ["node", "index.js"]
