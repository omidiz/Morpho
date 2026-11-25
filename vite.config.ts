/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/morpho/',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
