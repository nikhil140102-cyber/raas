import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This folder is the project root, even if other package-lock.json files exist in parent folders.
  outputFileTracingRoot: here,
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'unpdf', 'imapflow', 'mailparser', 'mammoth', 'nodemailer'],
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
