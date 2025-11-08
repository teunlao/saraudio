// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'SARAudio',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com' }],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', slug: 'index' },
            { label: 'Quickstart (WebSocket)', slug: 'getting-started/quickstart-ws' },
            { label: 'Quickstart (Vue + WS)', slug: 'getting-started/quickstart-vue-ws' },
            { label: 'Quickstart (HTTP)', slug: 'getting-started/quickstart-http' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Auth: Deepgram (Ephemeral)', slug: 'guides/auth/deepgram-ephemeral' },
            { label: 'Auth: Proxy (Overview)', slug: 'guides/auth/proxy' },
          ],
        },
        {
          label: 'Transcription',
          items: [
            { label: 'Overview', slug: 'transcription/overview' },
            { label: 'Options', slug: 'transcription/options' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Controller & Transport', slug: 'concepts/controller-and-transport' },
          ],
        },
        {
          label: 'Providers',
          items: [
            { label: 'Deepgram', slug: 'providers/deepgram' },
            { label: 'Soniox', slug: 'providers/soniox' },
          ],
        },
        {
          label: 'Reference',
          items: [{ label: 'Core Types', slug: 'reference/core-types' }],
        },
        {
          label: 'Troubleshooting',
          items: [{ label: 'Common Issues', slug: 'troubleshooting/common-issues' }],
        },
        
      ],
    }),
  ],
});
