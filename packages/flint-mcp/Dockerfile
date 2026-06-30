# Minimal runtime image for the Flint MCP HTTP server.
#
# Build context = packages/flint-mcp. The server bundle (dist/) and runtime
# assets (assets/) must be prebuilt on the host first:
#     npm run build:js && npm run build:mcp
# Only production deps are installed here. The native render binaries
# (@napi-rs/canvas, @resvg/resvg-js) install for linux and run from the
# container's local overlay filesystem — avoiding the Azure Files (CIFS) mmap
# SIGBUS ("Bus error") that the bare App Service code sandbox hits.
FROM node:22-slim

WORKDIR /app

# Production dependencies only. The package.json has no `prepare`/build lifecycle
# that runs on install, so this never tries to rebuild the bundle.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Prebuilt server bundle + runtime assets (UI HTML, fonts, agent skill).
COPY dist ./dist
COPY assets ./assets

ENV NODE_ENV=production \
    FLINT_MCP_TRANSPORT=http \
    FLINT_MCP_HOST=0.0.0.0 \
    FLINT_MCP_DISABLE_FILE_REFERENCE=1 \
    PORT=8080

EXPOSE 8080
CMD ["node", "dist/cli.js", "--transport", "http"]
