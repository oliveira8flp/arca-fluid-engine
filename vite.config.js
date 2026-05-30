import { defineConfig } from 'vite';

export default defineConfig({
  // This explicitly tells Vite how to handle GLSL files
  assetsInclude: ['**/*.glsl'],
});