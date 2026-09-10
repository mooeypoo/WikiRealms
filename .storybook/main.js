/** @type { import('@storybook/vue3-vite').StorybookConfig } */
const config = {
  // Stories live in a mirrored tree at the repo root, the same convention
  // `tests/` already follows — not co-located beside the components.
  stories: ['../stories/**/*.stories.js'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/vue3-vite',
    // Docgen off. Its only product is auto-generated prop tables, and both
    // engines cost more than that is worth here: vue-docgen-api (the
    // default) is deprecated and goes away in Storybook 11, and its
    // successor vue-component-meta requires TypeScript, which this project
    // deliberately does not use. Stories declare their args and argTypes
    // explicitly instead, which is more precise than inference anyway.
    options: { docgen: false },
  },
  core: { disableTelemetry: true },
  async viteFinal(config) {
    config.server ??= {}
    config.server.proxy = {
      ...config.server.proxy,
      '/api/aqs': {
        target: 'https://wikimedia.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/aqs/, '/api/rest_v1'),
      },
    }
    return config
  },
}
export default config
