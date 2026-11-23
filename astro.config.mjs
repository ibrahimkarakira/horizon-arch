// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// [UNCLEAR] Hosting is not chosen yet, so `site` and `base` stay unset on purpose.
/** @param {string} label @param {string} directory */
const group = (label, directory) => ({ label, items: [{ autogenerate: { directory } }] });

export default defineConfig({
  integrations: [
    starlight({
      title: 'horizon-arch',
      description: 'Architecture for systems that outlive their models.',
      sidebar: [
        group('Framework', 'framework'),
        group('Principles', 'principles'),
        group('Architectures', 'architectures'),
        group('ADRs', 'adrs'),
        group('Essays', 'essays'),
        group('Scenarios', 'scenarios'),
        group('Scoreboard', 'scoreboard'),
      ],
    }),
  ],
});
