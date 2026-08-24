const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('../pages/IndexPage.vue') },
      { path: 'features', component: () => import('../pages/FeaturesPage.vue') },
      { path: 'architecture', component: () => import('../pages/ArchitecturePage.vue') },
      { path: 'getting-started', component: () => import('../pages/GettingStartedPage.vue') },
      { path: 'mcp-extension', component: () => import('../pages/McpExtensionPage.vue') }
    ],
  },
  { path: '/:catchAll(.*)*', component: () => import('../pages/ErrorNotFound.vue') },
]
export default routes
