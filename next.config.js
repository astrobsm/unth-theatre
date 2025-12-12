/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    DATABASE_URL: 'postgresql://postgres:natiss_natiss@localhost:5432/theatre_db',
  },
}

module.exports = nextConfig
