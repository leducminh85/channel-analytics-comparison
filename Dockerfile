FROM node:20-alpine

# Cài đặt openssl cho Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy file cấu hình và cài đặt dependencies
COPY package*.json ./
RUN npm install

# Copy toàn bộ code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build ứng dụng Next.js
RUN npm run build

EXPOSE 3000

# Chạy migrate db và khởi động app (đợi thêm 10s để đảm bảo mạng ổn định)
CMD ["sh", "-c", "sleep 10 && npx prisma db push && npm start"]
