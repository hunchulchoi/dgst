FROM node:22 AS build
LABEL authors="hunchulchoi"

# 앱디렉토리를 만듬
WORKDIR /app

# 종속성 설치
COPY ./package*.json ./
#COPY ./patches ./patches

RUN npm install

# 앱 소스 코드를 복사
COPY . .

# 앱 빌드 (MongoDB 없이 — 런타임에만 연결)
ENV SKIP_DB_CONNECT=true
RUN npm run db:generate && npm run build

FROM node:22 AS production

WORKDIR /app
ENV BODY_SIZE_LIMIT=100M

# RUN groupadd -g 999 www-data
# RUN useradd -r -u 999 -g www-data www-data

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/build .
COPY --from=build /app/package.json .
COPY --from=build /app/package-lock.json .
#COPY --from=build /app/patches ./patches

RUN npm ci --omit dev

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER www-data

EXPOSE 3000

# 실행
ENTRYPOINT ["sh", "-c", "BODY_SIZE_LIMIT=100M exec node ."]
