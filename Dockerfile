FROM node:18
LABEL authors="hunchulchoi"

# 앱디렉토리를 만듬
WORKDIR /dgst

RUN echo ls -l

# 앱 소스 코드를 복사
COPY . .

# 종속성 설치
RUN npm install

# 앱 빌드
RUN npm run build

# 실행
ENTRYPOINT ["npm", "run", "preview", "--", "--host"]
