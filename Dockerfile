# SvelteKit via adapter-node: a Node server in, HTML out. Multi-stage — the build needs the whole
# dev toolchain (vite, svelte-check's deps, playwright, vitest), the server that runs needs almost none of it.
#
# docker build -t techshare-web .        (or `docker compose up -d --build`, which builds this and ./api)
#
# No environment variables are baked in. `src/env.ts` variables are validated at boot and read from
# the real environment by adapter-node, so one image runs against any deployment — the compose file
# or Dokploy supplies API_URL, SESSION_SECRET, ADMIN_PASSWORD, PUBLIC_TEMPLATE_URL, and the proxy
# headers adapter-node reads (PROTOCOL_HEADER / HOST_HEADER / ADDRESS_HEADER — set in compose.yml).
# (Caveat worth knowing: a `PUBLIC_*` variable that a *component* imports would be inlined into the
# client bundle at build time. Today PUBLIC_TEMPLATE_URL is read only server-side and passed into the
# page, which is why the build needs none of it. If that changes, pass it as a build ARG.)

FROM node:22-alpine AS build
WORKDIR /app

# Dependency layer first, so editing a .svelte file does not reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# `node build` needs nothing but build/ right now: Kit bundles every dependency this app uses
# (they are all devDependencies, so nothing is externalized) and the server imports only node:*
# builtins. That is what makes a ~10 MB runtime image possible.
#
# If a package ever moves into "dependencies" in package.json, Kit stops bundling it and this
# stage has to install it too — `COPY package.json package-lock.json ./` + `npm ci --omit=dev`.
COPY --from=build --chown=node:node /app/build ./build

USER node
EXPOSE 3000

# adapter-node shuts down on SIGTERM, so compose/Dokploy's default stop is a clean one; this only
# trims how long a redeploy waits for in-flight requests.
STOPSIGNAL SIGTERM

CMD ["node", "build"]
