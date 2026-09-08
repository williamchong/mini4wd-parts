import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    // Guides, about and other prose pages. Parts and chassis get their own
    // Zod-schema'd collections once the scraper lands (see docs/PLAN.md 4.2).
    content: defineCollection({
      type: 'page',
      source: '**/*.md',
      schema: z.object({
        description: z.string().optional()
      })
    })
  }
})
