FROM node:22-trixie AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV SKIP_DB_CONNECT=true
RUN DATABASE_URL=postgresql://localhost/dgst_build npm run db:generate \
  && npm run build

FROM node:22-trixie-slim AS production

WORKDIR /app
ENV BODY_SIZE_LIMIT=100M

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libheif-examples poppler-utils \
  && apt-get install -y --no-install-recommends bash ca-certificates curl \
  && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
  && apt-get update \
  && apt-get install -y --no-install-recommends infisical \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/build .
COPY --from=build /app/package.json .
COPY --from=build /app/package-lock.json .
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts .

RUN DATABASE_URL=postgresql://localhost/dgst_build npm ci --omit dev

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER www-data

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "."]
