FROM node:22-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm install --omit=dev

# Copiar el código de la aplicación
COPY . .

# Directorio de datos para persistencia de la base de datos SQLite
RUN mkdir -p data

EXPOSE 80

ENV PORT=80
ENV DATABASE_PATH=/app/data/katio.db

CMD ["node", "server.js"]
