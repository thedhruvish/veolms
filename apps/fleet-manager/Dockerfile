FROM node:24-bookworm-slim

WORKDIR /app
COPY dist/fleet-manager.cjs ./fleet-manager.cjs

CMD ["node", "fleet-manager.cjs", "run"]
