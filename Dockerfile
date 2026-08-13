FROM node:22-trixie AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV SKIP_DB_CONNECT=true
RUN npm run db:generate && npm run build

FROM node:22-trixie-slim AS production

WORKDIR /app
ENV BODY_SIZE_LIMIT=100M

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libheif-examples poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/build .
COPY --from=build /app/package.json .
COPY --from=build /app/package-lock.json .
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts .

RUN npm ci --omit dev

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

USER www-data

EXPOSE 3000

ENTRYPOINT ["node", "."]
