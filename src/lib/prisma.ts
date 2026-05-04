import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (url?.startsWith("prisma+postgres://")) {
    try {
      const urlObj = new URL(url);
      const apiKey = urlObj.searchParams.get("api_key");
      if (apiKey) {
        const decoded = JSON.parse(Buffer.from(apiKey, "base64").toString());
        return decoded.databaseUrl;
      }
    } catch (e) {}
  }
  return url;
};

const prismaClientSingleton = () => {
  const connectionString = getDatabaseUrl();
  const pool = new pg.Pool({ 
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
