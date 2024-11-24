FROM node AS build
LABEL authors="hunchulchoi"

# 앱디렉토리를 만듬
WORKDIR /app

# 종속성 설치
COPY ./package*.json ./
COPY ./patches ./patches

RUN npm install

# 앱 소스 코드를 복사
COPY . .

# 앱 빌드
RUN npm run build

FROM node AS production

WORKDIR /app

# RUN groupadd -g 999 www-data
# RUN useradd -r -u 999 -g www-data www-data

COPY --from=build /app/build .
COPY --from=build /app/package.json .
COPY --from=build /app/package-lock.json .
COPY --from=build /app/patches ./patches

RUN npm ci --omit dev

USER www-data

EXPOSE 3000

# 실행
ENTRYPOINT ["node", "."]
