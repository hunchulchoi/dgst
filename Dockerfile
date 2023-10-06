FROM node:18 as build
LABEL authors="hunchulchoi"

# 앱디렉토리를 만듬
WORKDIR /app

# 종속성 설치
COPY ./package*.json ./
RUN npm install

# 앱 소스 코드를 복사
COPY . .
# 앱 빌드
RUN npm run build

FROM node:18 as production
COPY --from=build /app/build .
COPY --from=build /app/package.json .
COPY --from=build /app/package-lock.json .
RUN npm ci --omit dev
EXPOSE 3000

# 실행
ENTRYPOINT ["node", "."]
