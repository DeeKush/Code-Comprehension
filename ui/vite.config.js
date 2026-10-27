const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('node:path');
module.exports = defineConfig({ root: path.resolve(__dirname), base: './', plugins: [react()], build: { outDir: path.resolve(__dirname, '../media/ui'), emptyOutDir: true, rollupOptions:{ input:{ interview:path.resolve(__dirname,'index.html'), assistant:path.resolve(__dirname,'assistant.html') } } } });
