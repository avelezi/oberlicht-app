import preset from './src/design-system/tailwind.preset.js';
/** @type {import('tailwindcss').Config} */
export default { presets: [preset], content: ['./index.html', './src/**/*.{ts,tsx}'] };
