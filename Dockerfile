# Balu Creative Studio.
#
# Two things this image needs beyond a plain Node app:
#   - a font, because every caption, CTA and end card is drawn by ffmpeg and there are no
#     fonts at all in the slim base image (rendering fails outright without one)
#   - ffmpeg itself, which arrives as a platform-specific binary downloaded by the
#     ffmpeg-static package during install - which is why dependencies are installed
#     inside the image rather than copied in from the host
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so this layer is cached across code changes.
# NODE_ENV is still unset here, so devDependencies install and the build can run.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
# Uploads, brand kits and renders live here. Mount a persistent volume at this path,
# or everything the client makes disappears on the next restart.
ENV STORAGE_DIR=/data
ENV DEFAULT_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000

CMD ["npm", "run", "start"]
