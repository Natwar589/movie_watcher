/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    '5579-2401-4900-c22c-cdde-803f-a680-5351-eafd.ngrok-free.app',
    '*.ngrok-free.app',
    'localhost:3000',
  ],
};

export default nextConfig;
