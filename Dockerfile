FROM node:22-alpine AS build

ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/build ./build
COPY package*.json ./
RUN npm ci

EXPOSE 3000
CMD ["node", "build"]
