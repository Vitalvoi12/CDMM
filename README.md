# CDMM

React + TypeScript + Vite calendar/study tracker with bidirectional CalDAV sync.

## Run with Docker on a Raspberry Pi (arm64)

Prebuilt multi-arch images (`linux/arm64`, `linux/amd64`) are published to
GHCR by CI on every push to `main`.

```sh
git clone git@github.com:Vitalvoi12/CDMM.git
cd CDMM
# needed only while the GHCR package is private:
docker login ghcr.io -u Vitalvoi12
docker compose up -d
```

Then open `http://<pi-ip>:5173`.

To build the image locally instead of pulling it:

```sh
docker compose up -d --build
```

## Development

```sh
npm install
npm run dev
```

CalDAV is exposed as a React/Vite dev server plus a static production server
(`server.mjs`, run inside the container) that also proxies cross-origin
CalDAV requests from the browser.

