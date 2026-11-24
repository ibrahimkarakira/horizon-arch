// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// [UNCLEAR] Hosting is not chosen yet, so `site` and `base` stay unset on purpose.
/** @param {string} label @param {string} directory */
const group = (label, directory) => ({ label, items: [{ autogenerate: { directory } }] });

export default defineConfig({
  integrations: [
    // Must come before starlight (astro-mermaid README). Renders ```mermaid blocks in the browser,
    // switching between Mermaid's default and dark themes with the site theme.
    mermaid({ enableLog: false }),
    starlight({
      title: 'horizon-arch',
      description: 'Architecture for systems that outlive their models.',
      customCss: ['./src/styles/diagrams.css'],
      sidebar: [
        group('Framework', 'framework'),
        group('Principles', 'principles'),
        group('Architectures', 'architectures'),
        group('ADRs', 'adrs'),
        group('Essays', 'essays'),
        group('Scenarios', 'scenarios'),
        { label: 'Scoreboard', items: ['scoreboard'] },
        group('Reference', 'reference'),
      ],
    }),
  ],
});
