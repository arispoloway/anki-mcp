FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source and config
COPY src/ src/
COPY config.json .

EXPOSE 8080
ENTRYPOINT ["bun", "src/index.ts"]
